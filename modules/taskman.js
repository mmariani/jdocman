/*jslint indent: 2, nomen: true, vars: true, browser: true */
/*global alert, $, Logger, RSVP, task_util, dav_storage, Handlebars, jiodate, moment, i18n, jIO, task_data, Blob, FileReader */

$(document).on('mobileinit', function () {
  "use strict";

  var taskman = {},
    input_timer = null,
    default_storage_name = 'Local',
    selected_storage_id = null,
    details_task_id_target = null,    // parameter for details.html -- we cannot use URL parameters with appcache
    details_storage_id_target = null; // parameter for storage_details.html

  $('.initHandler').removeClass('initHandler');

  $.mobile.selectmenu.prototype.options.nativeMenu = false;
  $.datepicker.setDefaults({dateFormat: 'yy-mm-dd'});

  Logger.useDefaults();   // log to console

  //
  // DEBUG for development, WARN for production
  //
  Logger.setLevel(Logger.DEBUG);

  //
  // Register custom 'storage connected' event
  //
  RSVP.EventTarget.mixin(taskman);

  //
  // Register helpers for Handlebars
  //
  task_util.registerHelpers();

  //
  // Immediately apply translation to all elements
  // which have a data-i18n attribute.
  //
  var applyTranslation = function () {
    $('[data-i18n]').i18n();
  };

  //
  // Initial setup for translation
  //
  /*jslint unparam: true*/
  $.i18n.init({
    detectLngQS: 'lang',
    fallbackLng: 'en',
    ns: 'translation',
    resGetPath: 'i18n/__lng__/__ns__.json',
    preload: ['en', 'fr', 'zh']
  }, function (t) {
    applyTranslation();
  });
  /*jslint unparam: false*/


  //
  // Change language from UI
  //
  $(document).on('change', '#translate', function () {
    var curr_lang = $(this).val();
    $.i18n.setLng(curr_lang, function () {
      applyTranslation();
    });
  });


  // dialogs are transparent

  /*jslint unparam: true*/
  $(document).on('pagebeforeshow', 'div[data-role="dialog"]', function (e, ui) {
    ui.prevPage.addClass("ui-dialog-background ");
  });

  $(document).on('pagehide', 'div[data-role="dialog"]', function (e, ui) {
    $(".ui-dialog-background ").removeClass("ui-dialog-background ");
  });
  /*jslint unparam: false*/


// XXX can we log all failed promises?
//    RSVP.on('error', function (event) {
//      console.assert(false, event.detail);
//    });


  //
  // Display an 'error' object as received by jIO methods
  //
  var errorDialog = function (error) {
    // XXX there must be a better way to fill the content.
    $(document).on('pagebeforeshow.errordialog', '#errordialog', function (ev) {
      $(ev.target).find('.error-header').html(error.statusText);
      $(ev.target).find('.error-message').html(error.message);
      $(document).off('pagebeforeshow.errordialog');
    });
    $.mobile.navigate('errordialog.html');
  };


  var _jio_config = null;

  var jioConfigConnect = function () {
    return new RSVP.Promise(function (resolve) {
      var jio_config = jIO.createJIO({
        'type': 'local',
        'username': 'Admin',
        'application_name': 'Taskman-config'
      });

      if (_jio_config) {
        resolve(_jio_config);
      } else {
        //
        // either load configuration from local storage, or create it
        //
        Logger.debug('Reading config: %o', jio_config);
        jio_config.allDocs().then(function (response) {
          var post_promise = null,
            default_config_list = [
              {
                storage_type: 'local',
                username: 'Admin',
                application_name: 'Local',
                url: '',
                realm: '',
                auth_type: '',
                password: ''
              }, {
                storage_type: 'local',
                username: 'Admin',
                application_name: 'Taskman-local 2',
                url: '',
                realm: '',
                auth_type: '',
                password: ''
              }
            ];

          if (response.data.total_rows) {
            _jio_config = jio_config;
            resolve(_jio_config);
          } else {
            Logger.debug('No configuration found, populating initial storage');
            post_promise = default_config_list.map(function (config) {
              var metadata = {
                modified: new Date(),
                type: 'Storage Configuration',
                title: config.application_name
              },
                blob = new Blob([JSON.stringify(config)], {type: 'application/json'});
              return jio_config.post(metadata).then(function (response) {
                return jio_config.putAttachment({
                  _id: response.id,
                  _attachment: 'config',
                  _data: blob
                });
              });
            });
            RSVP.all(post_promise).
              then(function () {
                Logger.info('Configuration created.');
                _jio_config = jio_config;
                resolve(_jio_config);
              }).
              fail(function (error) {
                errorDialog(error);
              });
          }
        });
      }
    });
  };


  var key_schema = {
    cast_lookup: {
      dateType: jiodate.JIODate
    },
    match_lookup: {
      translatedStateMatch: function (object_value, value) {
        var translated_object_value = i18n.t(object_value);
        return RSVP.resolve(task_util.accentFoldLC(translated_object_value) ===
                            task_util.accentFoldLC(value));
      }
    },
    key_set: {
      title: {
        read_from: 'title',
        cast_to: task_util.accentFoldLC
      },
      description: {
        read_from: 'description',
        cast_to: task_util.accentFoldLC
      },
      start: {
        read_from: 'start',
        cast_to: 'dateType'
      },
      stop: {
        read_from: 'stop',
        cast_to: 'dateType'
      },
      translated_state: {
        read_from: 'state',
        equal_match: 'translatedStateMatch'
      }
    }
  };


  //
  // Return a storage description according to a configuration document.
  //
  var storageDescription = function (config) {
    if (config.storage_type === 'local') {
      return {
        type: 'local',
        username: config.username,
        application_name: config.application_name
      };
    }

    if (config.storage_type === 'dav') {
      return dav_storage.createDescription({
        url: config.url,
        auth_type: config.auth_type,
        realm: config.realm,
        username: config.username,
        password: config.password
      });
    }

    if (config.storage_type === 'erp5') {
      return {
        type: 'erp5',
        url: config.url,
        username: config.username,
        password: config.password
      };
    }

    if (config.storage_type === 'replicate') {
      //replicate storage with erp5
      return {
        type: 'replicate',
        storage_list: [{
          type: 'gid',
          constraints: {
            'default': {
              type: 'string',
              reference: 'string'
            }
          },
          sub_storage: {
            type: 'local',
            username: config.username,
            application_name: 'task-manager'
          }
        }, {
          type: 'gid',
          constraints: {
            'default': {
              type: 'string',
              reference: 'string'
            }
          },
          sub_storage: {
            type: 'erp5',
            url: config.url,
            username: config.username,
            password: config.password
          }
        }]
      };
    }

    alert('unsupported storage type: ' + config.storage_type);
  };


  //
  // Fill with default/test data, if the storage is empty
  //
  var populateInitialTasks = function (jio) {
    return new RSVP.Promise(function (resolve) {
      jio.allDocs().then(function (response) {
        var total_rows = response.data.total_rows;
        Logger.info('Found %i objects.', total_rows);
        if (total_rows) {
          resolve();
          return;
        }

        Logger.info('Populating initial storage...');
        var objs = Array.prototype.concat(task_data.projects, task_data.states, task_data.tasks),
          ins_promises = objs.map(function (obj) {
            obj.modified = new Date();
            Logger.debug('Inserting %s: %o', obj.type, obj);
            return jio.post(obj);
          });

        RSVP.all(ins_promises).
          then(function () {
            Logger.debug('Inserted %i objects', ins_promises.length);
            resolve();
          });
          // XXX handle failure
      });
    });
  };

  var _jio_tasks = null;


  var jioConnect = function () {
    return new RSVP.Promise(function (resolve) {
      if (_jio_tasks) {
        resolve(_jio_tasks);
      } else {
        jioConfigConnect().
          then(function (jio_config) {
            return jio_config.allDocs({include_docs: true});
          }).
          then(function (alldocs) {
            var attachments_promise = alldocs.data.rows.map(function (row) {
              var prom = _jio_config.        // XXX _jio_config
                getAttachment({_id: row.id, _attachment: 'config'}).
                then(function (response) {
                  return jIO.util.readBlobAsText(response.data);
                }).
                then(function (ev) {
                  var config = JSON.parse(ev.target.result);
                  if ((selected_storage_id && (row.id === selected_storage_id))
                      || (!selected_storage_id && (config.application_name === default_storage_name))) {
                    return config;
                  }
                });
              return prom;
            });
            return RSVP.all(attachments_promise);
          }).
          then(function (config_list) {
            config_list = config_list.filter(function (el) {
              return (el !== undefined);
            });
            return config_list[0];
          }).
          then(function (config) {
            Logger.debug('Using storage: %o', config);
            var storage_description = storageDescription(config);
            storage_description.key_schema = key_schema;
            _jio_tasks = jIO.createJIO(storage_description);
            return populateInitialTasks(_jio_tasks);
          }).
          then(function () {
            resolve(_jio_tasks);
          });
          // XXX handle error
      }
    });
  };




  //
  // Remove all data from a storage.
  //
  var deleteStorageContent = function (jio) {
    jio.allDocs().then(function (response) {
      var del_promises = response.data.rows.map(function (row) {
        Logger.debug('Removing: %s on storage %o', row.id, jio);
        return jio.remove({_id: row.id});
      });
      RSVP.all(del_promises).then(function () {
        Logger.debug('%i object(s) have been removed from %o', del_promises.length, jio);
      });
    });
  };

  //
  // Remove test data, must reload to create again.
  //
  $(document).on('click', '#btn-reset-data', function () {
    jioConfigConnect().then(function (jio_config) {
      jioConnect().then(function (jio) {
        Logger.info('Clearing tasks storage.');
        deleteStorageContent(jio);
        Logger.info('Clearing configuration storage.');
        deleteStorageContent(jio_config);
      });
    });
  });


  $(document).on('pagebeforeshow', '#projects-page', function () {
    Logger.debug('Loading Projects page');
    jioConnect().then(function (jio) {
      var options = {
        include_docs: true,
        query: '(type:"Project") OR (type:"Task")',
        sort_on: [['project', 'ascending']]
      }, tasks = {};

      Logger.debug('Querying projects...');
      jio.allDocs(options).
        then(function (response) {
          var i = 0, doc = null;

          for (i = 0; i < response.data.total_rows; i += 1) {
            doc = response.data.rows[i].doc;
            if (doc.type === 'Project') {
              tasks[doc.project] = {tasks: [], task_count: 0};
            }
          }

          for (i = 0; i < response.data.total_rows; i += 1) {
            doc = response.data.rows[i].doc;
            if (doc.type === 'Task') {
              tasks[doc.project] = tasks[doc.project] || {tasks: [], task_count: 0};
              tasks[doc.project].tasks.push(doc);
              tasks[doc.project].task_count += 1;
            }
          }

          var template = Handlebars.compile($('#project-list-template').text());
          $('#project-list-container')
            .html(template({tasks: tasks}))
            .trigger('create');
        });
      applyTranslation();
    });
  });

  var parseJIODate = function (s) {
    try {
      return jiodate.JIODate(s);
    } catch (e) {
      return null;
    }
  };

  var updateTaskList = function (jio, sort_by) {
    var input_text = $('#search-tasks').val(),
      search_string = input_text ? '%' + input_text + '%' : '%',
      query = null,
      search_date = parseJIODate(input_text),
      content_query_list = [
        {
          type: 'simple',
          key: 'title',
          value: search_string
        }, {
          type: 'simple',
          key: 'description',
          value: search_string
        }, {
          type: 'simple',
          key: 'translated_state',
          value: input_text
        }
      ];

    if (search_date) {
      Logger.debug('Search for date: %o', search_date);

      content_query_list.push({
        type: 'complex',
        operator: 'AND',
        query_list: [
          {
            type: 'simple',
            operator: '<=',
            key: 'start',
            value: search_date
          }, {
            type: 'simple',
            operator: '>=',
            key: 'stop',
            value: search_date
          }
        ]
      });
    }

    query = {
      type: 'complex',
      operator: 'AND',
      query_list: [
        {
          type: 'simple',
          key: 'type',
          value: 'Task'
        }, {
          type: 'complex',
          operator: 'OR',
          query_list: content_query_list
        }
      ]
    };

    var options = {
      include_docs: true,
      wildcard_character: '%',
      sort_on: [
        [sort_by || 'start', 'ascending']
      ],
      query: query
    };

    Logger.debug('Querying tasks with: "%s" (%o)...', input_text, options.query);
    jio.allDocs(options).
      then(function (response) {
        Logger.debug('%i tasks found', response.data.total_rows);
        var template = Handlebars.compile($('#task-list-template').text());
        $('#task-list-container')
          .html(template(response.data))
          .trigger('create');
        applyTranslation();
      });
  };


  $(document).on('change', '#task-sortby', function () {
    jioConnect().then(function (jio) {
      var sort_by = $(this).val();
      updateTaskList(jio, sort_by);
    });
  });



  $(document).on('pagebeforeshow', '#tasks-page', function () {
    Logger.debug('Loading Tasks page');
    jioConnect().then(function (jio) {
      $('#task-sortby-button').addClass('ui-btn-left');
      updateTaskList(jio);
    });
  });


  $(document).on('input', '#search-tasks', function () {
    jioConnect().then(function (jio) {
      if (input_timer) {
        window.clearTimeout(input_timer);
        input_timer = null;
      }
      input_timer = window.setTimeout(function () {
        updateTaskList(jio);
        input_timer = 0;
      }, 500);
    });
  });



  //
  // Open the details page for a task
  //

  $(document).on('click', '.task-details-link', function () {
    details_task_id_target = $(this).data('jio-id');
    $.mobile.navigate('task-details.html');
  });


  $(document).on('pagebeforeshow', '#task-details-page', function () {
    jioConnect().then(function (jio) {
      Logger.debug('Loading Task Edit page');
      var projects_promise = jio.allDocs({include_docs: true, sort_on: [['project', 'ascending']], query: '(type:"Project")'}),
        task_promise = null,
        states_promise = jio.allDocs({include_docs: true, sort_on: [['state', 'ascending']], query: '(type:"State")'});

      if (details_task_id_target) {
        task_promise = jio.get({_id: details_task_id_target});
        Logger.debug('Retrieving task %s', details_task_id_target);
        details_task_id_target = null;
      } else {
        task_promise = new RSVP.Promise(function (resolve) {
          resolve({
            data: {
              title: 'New task',
              start: moment().format('YYYY-MM-DD')
            }
          });
        });
      }

      RSVP.all([task_promise, projects_promise, states_promise]).
        then(function (responses) {
          var task_resp = responses[0],
            projects_resp = responses[1],
            states_resp = responses[2];

          var template = Handlebars.compile($('#task-details-template').text());
          $('#task-details-container')
            .html(template({task: task_resp.data, projects: projects_resp.data.rows, states: states_resp.data.rows}))
            .trigger('create');
          task_util.jqmSetSelected('#task-project', task_resp.data.project);
          task_util.jqmSetSelected('#task-state', task_resp.data.state);
          // XXX if the project does not exist anymore, the first one is selected
          applyTranslation();
        });
        // XXX handle failure (no task found)
    });
  });


  //
  // Create/Modify a task
  //
  $(document).one('click', '#task-save', function () {
    jioConnect().then(function (jio) {
      var id = $('#task-id').val(),
        title = $('#task-title').val(),
        start = $('#task-start').val(),
        stop = $('#task-stop').val(),
        project = $('#task-project').val(),
        state = $('#task-state').val(),
        description = $('#task-description').val(),
        doc = {};

      // XXX validate input

      doc = {
        type: 'Task',
        title: title,
        start: start,
        stop: stop,
        project: project,
        state: state,
        description: description,
        modified: new Date()
      };

      if (id) {
        doc._id = id;
        jio.put(doc).
          then(function (response) {
            Logger.debug('Updated task %o:', response.id);
            Logger.debug('  result %s', response.result);
            Logger.debug('  status %s (%s)', response.status, response.statusText);
            parent.history.back();
            // XXX explicit redirect
          }).
          fail(function () { // (error)
            // XXX not working
            // errorDialog(error);
            return;
          });
      } else {
        jio.post(doc).
          then(function (response) {
            Logger.debug('Created task %o:', response.id);
            Logger.debug('  result %s', response.result);
            Logger.debug('  status %s (%s)', response.status, response.statusText);
            parent.history.back();
            // XXX explicit redirect
          }).
          fail(function () {
            // XXX not working
            // errorDialog(error);
            return;
          });
      }
    });
  });


  //
  // Delete a task
  //
  $(document).on('click', '#task-delete', function () {
    jioConnect().then(function (jio) {
      var id = $('#task-id').val();

      jio.remove({_id: id}).
        then(function (response) {
          Logger.debug('Deleted task %o:', response.id);
          Logger.debug('  status %s', response.status);
          parent.history.back();
          // XXX explicit redirect
        }).
        fail(function (error) {
          errorDialog(error);
        });
    });
  });


  //
  // Update form for editing project / state list
  //
  var updateSettingsForm = function (jio) {
    var projects_promise = jio.allDocs({include_docs: true, sort_on: [['project', 'ascending']], query: '(type:"Project")'}),
      states_promise = jio.allDocs({include_docs: true, sort_on: [['state', 'ascending']], query: '(type:"State")'});

    RSVP.all([projects_promise, states_promise]).
      then(function (responses) {
        var projects_resp = responses[0],
          states_resp = responses[1];

        var template = Handlebars.compile($('#settings-form-template').text());
        $('#settings-form-container')
          .html(template({projects: projects_resp.data.rows, states: states_resp.data.rows}))
          .trigger('create');
        applyTranslation();

        // update select menu with current selected language
        task_util.jqmSetSelected('#translate', i18n.lng());
      });
      // XXX handle failure (no task found)
  };

  $(document).on('pagebeforeshow', '#settings-page', function () {
    jioConnect().then(function (jio) {
      Logger.debug('Loading Settings page');
      updateSettingsForm(jio);
    });
  });


  //
  // resolves to a list of {doc: .., config: ...} with the storage configurations
  //
  var storageConfigList = function (jio_config) {
    return new RSVP.Promise(function (resolve) {
      jio_config.allDocs({include_docs: true}).
        then(function (alldocs) {
          var attachments_promise = alldocs.data.rows.map(function (row) {
            var prom = jio_config.
              getAttachment({_id: row.id, _attachment: 'config'}).
              then(function (response) {
                return jIO.util.readBlobAsText(response.data);
              }).
              then(function (ev) {
                return {
                  doc: row.doc,
                  config: JSON.parse(ev.target.result)
                };
              });
            return prom;
          });
          resolve(RSVP.all(attachments_promise));
        });
    });
  };


  //
  // Update form for editing storages
  //

  var updateStorageForm = function (jio_config) {
    storageConfigList(jio_config)
      .then(function (storage_config_list) {
        var template = Handlebars.compile($('#storage-form-template').text());

        if (!selected_storage_id) {
          storage_config_list.forEach(function (o) {
            if (o.config.application_name === default_storage_name) {
              selected_storage_id = o.doc._id;
            }
          });
        }

        $('#storage-form-container')
          .html(template({storage_config_list: storage_config_list}))
          .trigger('create');
        applyTranslation();
        // initialize radio button with previously selected, or default, value
        $('#storage-form input:radio[name=storage][value=' + selected_storage_id + ']').prop('checked', true).checkboxradio('refresh');
        // XXX handle failure (no config found)
      });
  };



  $(document).on('pagebeforeshow', '#storage-page', function () {
    jioConfigConnect().then(function (jio_config) {
      Logger.debug('Loading Storage page');
      updateStorageForm(jio_config);
    });
  });

  $(document).on('change', 'input:radio[name=storage]', function () {
    selected_storage_id = $(this).val();
    // force reload from config
    _jio_tasks = null;
    Logger.debug('Switching storage to', selected_storage_id);
  });



  //
  // Open the details page for a storage
  //
  $(document).on('click', '#settings-edit-storage', function () {
    details_storage_id_target = $('#storage-form input:radio[name=storage]:checked').val();
    $.mobile.navigate('storage-details.html');
  });



  //
  // resolves to the configuration object of the specified storage.
  // If id is null, resolves to a default configuration.
  //
  var storageConfig = function (jio_config, id) {
    return new RSVP.Promise(function (resolve) {
      if (id === null) {
        resolve({
          storage_type: 'local'
        });
      } else {
        jio_config.get({_id: id}).
          then(function (response) {
            var prom = jio_config.
              getAttachment({_id: response.id, _attachment: 'config'}).
              then(function (response) {
                return jIO.util.readBlobAsText(response.data);
              }).
              then(function (ev) {
                return JSON.parse(ev.target.result);
              });
            resolve(prom);
          });
      }
    });
  };



  $(document).on('pagebeforeshow', '#storage-details-page', function () {
    jioConfigConnect().then(function (jio_config) {
      var id = details_storage_id_target;
      Logger.debug('Loading Storage Edit page:', id);
      details_storage_id_target = null;

      storageConfig(jio_config, id).
        then(function (config) {
          var template = Handlebars.compile($('#storage-details-template').text());
          $('#storage-details-container')
            .html(template({id: id, config: config}))
            .trigger('create');
          applyTranslation();
        });

    });
  });


  //
  // Create/Modify a storage
  //
  $(document).one('click', '#storage-save', function () {
    jioConfigConnect().then(function (jio_config) {
      var id = $('#storage-id').val(),
        application_name = $('#storage-application_name').val(),
        storage_type = $('#storage-storage_type').val(),
        url = $('#storage-url').val(),
        auth_type = $('#storage-auth_type').val(),
        realm = $('#storage-realm').val(),
        username = $('#storage-username').val(),
        password = $('#storage-password').val(),
        config = null,
        metadata = null,
        update_prom = null;

      // XXX validate input

      config = {
        application_name: application_name,
        storage_type: storage_type,
        url: url,
        auth_type: auth_type,
        realm: realm,
        username: username,
        password: password
      };

      metadata = {
        modified: new Date(),
        type: 'Storage Configuration',
        config: config
      };

      if (id) {
        metadata._id = id;
        update_prom = jio_config.put(metadata);
      } else {
        update_prom = jio_config.post(metadata);
      }

      update_prom.
        then(function (response) {
          var attachment = {
            _id: response.id,
            _attachment: 'config',
            _data: new Blob([JSON.stringify(config)], {type: 'application/json'})
          };
          return jio_config.putAttachment(attachment);
        }).
        then(function (response) {
          Logger.debug('Updated storage %s', response.id);
          Logger.debug('  status %s (%s)', response.status, response.statusText);
          $.mobile.navigate('storage.html');
        });

    });
  });


  //
  // Delete a storage
  //
  $(document).on('click', '#storage-delete', function () {
    jioConfigConnect().then(function (jio_config) {
      var id = $('#storage-id').val();

      jio_config.remove({_id: id}).
        then(function (response) {
          Logger.debug('Deleted storage %o:', response.id);
          Logger.debug('  status %s', response.status);
          $.mobile.navigate('storage.html');
        }).
        fail(function (error) {
          errorDialog(error);
        });
    });
  });



  //
  // Delete a state
  //
  $(document).on('click', '#settings-del-state', function () {
    jioConnect().then(function (jio) {
      var selected = $('input:checkbox:checked[name|=state]').get(),
        del_promises = selected.map(function (el) {
          return jio.remove({_id: el.value});
        });

      RSVP.all(del_promises).then(function () {
        Logger.debug('%i state(s) have been removed', del_promises.length);
        updateSettingsForm(jio);
      });
    });
  });


  //
  // Add a state
  //
  $(document).on('click', '#settings-add-state', function () {
    jioConnect().then(function (jio) {
      var state = window.prompt("State name?") || '',
        doc = null;

      state = state.trim();

      if (!state) {
        return;
      }

      state = state.charAt(0).toUpperCase() + state.slice(1);

      doc = {
        'type': 'State',
        'state': state,
        'modified': new Date()
      };

      jio.post(doc).
        then(function (response) {
          Logger.debug('Added state: %o', response.id);
          Logger.debug('  status %s (%s)', response.status, response.statusText);
          updateSettingsForm(jio);
        });
      // XXX handle failure
    });
  });



  //
  // Delete a project
  //
  $(document).on('click', '#settings-del-project', function () {
    jioConnect().then(function (jio) {
      var selected = $('input:checkbox:checked[name|=project]').get(),
        del_promises = selected.map(function (el) {
          return jio.remove({_id: el.value});
        });

      RSVP.all(del_promises).then(function () {
        Logger.debug('%i project(s) have been removed', del_promises.length);
        updateSettingsForm(jio);
      });
    });
  });


  //
  // Add a project
  //
  $(document).on('click', '#settings-add-project', function () {
    jioConnect().then(function (jio) {
      var project = window.prompt("Project name?") || '',
        doc = null;

      project = project.trim();

      if (!project) {
        return;
      }

      project = project.charAt(0).toUpperCase() + project.slice(1);

      doc = {
        'type': 'Project',
        'project': project,
        'modified': new Date()
      };

      jio.post(doc).
        then(function (response) {
          Logger.debug('Added project: %o', response.id);
          Logger.debug('  status %s (%s)', response.status, response.statusText);
          updateSettingsForm(jio);
        });
      // XXX handle failure
    });
  });

});

