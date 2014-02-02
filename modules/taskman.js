/*jslint indent: 2, nomen: true, vars: true, browser: true */
/*global alert, $, Logger, RSVP, task_util, dav_storage, Handlebars, jiodate, moment, i18n, jIO, task_data, Blob, complex_queries  */

$(document).on('mobileinit', function () {
  "use strict";

  var input_timer = null,
    default_storage_id = 'default_storage',
    //
    // Data passed around for page changes -- we cannot use URL parameters with appcache
    // Waiting for better parameter support in JQM 1.5 (http://jquerymobile.com/roadmap/)
    page_params = {};

  var getSelectedStorage = function () {
    return localStorage.getItem('set_selected_storage');
  };

  var setSelectedStorage = function (val) {
    return localStorage.setItem('set_selected_storage', val);
  };

  if (!getSelectedStorage()) {
    setSelectedStorage(default_storage_id);
  }

  $('.initHandler').removeClass('initHandler');

  $.mobile.selectmenu.prototype.options.nativeMenu = false;
  $.datepicker.setDefaults({dateFormat: 'yy-mm-dd'});

  task_util.registerHandlebarsHelpers();

  Logger.useDefaults();   // log to console

  // DEBUG for development, WARN for production
  Logger.setLevel(Logger.DEBUG);

  /**
   * Immediately apply translation to all elements
   * which have a data-i18n attribute.
   */
  var applyTranslation = function () {
    $('[data-i18n]').i18n();
  };

  /**
   * Set up the translations for i18next.
   * This might trigger a 404 for an unsupported locale
   * before falling back, i.e. en-US -> en
   * Also applies translations to the current page as soon
   * as the data is ready.
   * For the options, see http://i18next.com/pages/doc_init.html
   */
  $.i18n.init({
    detectLngQS: 'lang',
    fallbackLng: 'en',
    ns: 'translation',
    resGetPath: 'i18n/__lng__/__ns__.json',
    preload: ['en', 'fr', 'zh']
  }, function () {
    applyTranslation();
  });


  /**
   * Apply a language change upon selection from the menu.
   * This will store the selected language in the 'i18next'
   * session cookie.
   */
  $(document).on('change', '#translate', function () {
    var curr_lang = $(this).val();
    $.i18n.setLng(curr_lang, function () {
      applyTranslation();
    });
  });


  /**
   * Attempt to make jqm dialogs transparent.
   * XXX this does not work if the page has been changed before
   * opening the dialog.
   */
  /*jslint unparam: true*/
  $(document).on('pagebeforeshow', 'div[data-role="dialog"]', function (e, ui) {
    ui.prevPage.addClass("ui-dialog-background ");
  });

  $(document).on('pagehide', 'div[data-role="dialog"]', function (e, ui) {
    $(".ui-dialog-background ").removeClass("ui-dialog-background ");
  });
  /*jslint unparam: false*/


  /**
   * This function must be used as a then parameter if you don't want to manage
   * errors. It changes the promise to the fulfilment channel with no fulfilment
   * value.
   *
   *     doSomething().fail(ignoreError).then(...);
   */
  function ignoreError() {
    Logger.error("Error ignored!");
    // no error propagated here
  }


  /**
   * This function must be used as a then parameter if you don't want to
   * propagate notifications.
   *
   *     doSomething().progress(stopProgressPropagation).then(...);
   */
  function stopProgressPropagation() {
    // stop progress propagation
    throw new Error("Progress stopped");
  }


  /**
   * Display an error's title and message, within a dialog,
   * as received by jIO methods.
   */
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
  var _jio_config_promise = null;


  /**
   * This function creates the global _jio_config instance bound to localStorage
   * and, if the storage is empty, inserts some hard coded configurations.
   * The returned promise will have the _jio_config as fulfilment value or undefined,
   * and it will never be rejected.
   * This promise is not cancellable and sends no notifications.
   *
   * @return {Promise} The promise < _jio_config, post_error >
   */
  var jioConfigConnect = function () {
    if (_jio_config) {
      return RSVP.resolve(_jio_config);
    }
    if (_jio_config_promise) {
      // another call to jioConfigConnect() has been made,
      // but the promise has not resolved yet, so we return it again
      return _jio_config_promise;
    }

    var jio_config = jIO.createJIO({
      'type': 'local',
      'username': 'Admin',
      'application_name': 'Taskman-config'
    });

    //
    // either load configuration from local storage, or create it
    //
    Logger.debug('Reading config: %o', jio_config);

    var postSomeConfIfNecessary = function (alldocs_response) {
      if (alldocs_response.data.total_rows) {
        _jio_config = jio_config;
        return _jio_config;
      }
      Logger.debug('No configuration found, populating initial storage');

      var post_promise = null,
        // first of the list is the default storage
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
            storage_type: 'dav',
            username: 'Admin',
            application_name: 'WebDAV',
            url: 'http://localhost/',
            realm: '',
            auth_type: 'none',
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

      post_promise = default_config_list.map(function (config, i) {
        var metadata = {
          modified: new Date(),
          type: 'Storage Configuration'
        },
          blob = new Blob([JSON.stringify(config)], {type: 'application/json'});
        if (i === 0) {
          metadata._id = default_storage_id;
        }
        return jio_config.post(metadata).then(function (response) {
          return jio_config.putAttachment({
            _id: response.id,
            _attachment: 'config',
            _data: blob
          });
        });
      });

      return RSVP.all(post_promise).
        then(function () {
          Logger.info('Configuration created.');
          _jio_config = jio_config;
          return _jio_config;
        });
    };

    _jio_config_promise = jio_config.allDocs().
      then(postSomeConfIfNecessary).
      then(null, ignoreError, stopProgressPropagation);
    // XXX we should never ignore errors!
    return _jio_config_promise;

  };


  /**
   * Defines a schema of search keys for the task queries,
   * as described in http://jio.readthedocs.org/en/latest/keys.html
   * This schema implements filtering with partial dates, titles and descriptions
   * regardless of the accents and letter case, and translated state values.
   */
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


  /**
   * Creates a storage description from to a configuration document.
   */
  var storageDescription = function (config) {
    if (config.storage_type === 'local') {
      return {
        type: 'local',
        username: config.username,
        application_name: config.application_name
      };
    }

    if (config.storage_type === 'dav') {
      return {
        type: 'query',
        sub_storage: dav_storage.createDescription(
          config.url,
          config.auth_type,
          config.realm,
          config.username,
          config.password
        )
      };
    }

// XXX not implemented / not tested yet
//    if (config.storage_type === 'erp5') {
//      return {
//        type: 'erp5',
//        url: config.url,
//        username: config.username,
//        password: config.password
//      };
//    }
//
//    if (config.storage_type === 'replicate') {
//      //replicate storage with erp5
//      return {
//        type: 'replicate',
//        storage_list: [{
//          type: 'gid',
//          constraints: {
//            'default': {
//              type: 'string',
//              reference: 'string'
//            }
//          },
//          sub_storage: {
//            type: 'local',
//            username: config.username,
//            application_name: 'task-manager'
//          }
//        }, {
//          type: 'gid',
//          constraints: {
//            'default': {
//              type: 'string',
//              reference: 'string'
//            }
//          },
//          sub_storage: {
//            type: 'erp5',
//            url: config.url,
//            username: config.username,
//            password: config.password
//          }
//        }]
//      };
//    }

    alert('unsupported storage type: ' + config.storage_type);
  };


  /**
   * If a storage is empty, inserts default/test data
   * with projects, states, and tasks.
   */
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
            return jio_config.getAttachment({_id: getSelectedStorage(), _attachment: 'config'});
          }).
          then(function (response) {
            return jIO.util.readBlobAsText(response.data);
          }).
          then(function (ev) {
            return JSON.parse(ev.target.result);
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
      }
    });
  };


  /**
   * Remove all data from a storage.
   *
   * @param {Object} jio The storage to clear
   */
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


  /**
   * Remove test data, must reload the page to create it again.
   */
  $(document).on('click', '#btn-reset-data', function () {
    jioConfigConnect().then(function (jio_config) {
      jioConnect().then(function (jio) {
        Logger.info('Clearing tasks storage.');
        deleteStorageContent(jio);
        Logger.info('Clearing configuration storage.');
        deleteStorageContent(jio_config);
        // XXX user notification
      });
    });
  });


  /**
   * Perform a query with allDocs(), and return a promise
   * that resolves to the list of 'doc' objects.
   *
   * @param {Object} jio the storage instance to use
   * @param {Object} options the argument to use with allDocs()
   * @return {Promise} A Promise which resolves to a list of 'doc' objects
   */
  var docQuery = function (jio, options) {
    return jio.allDocs(options).
      then(function (response) {
        return RSVP.resolve(response.data.rows.map(function (row) {
          return row.doc;
        }));
      });
  };


  /**
   * Prepare the projects.html page before displaying.
   * This queries the storage for a list of the projects and tasks,
   * then provides them as parameters to Handlebars.
   * Translation is applied after rendering the template.
   */
  $(document).on('pagebeforeshow', '#projects-page', function () {
    Logger.debug('Loading Projects page');
    jioConnect().then(function (jio) {
      var options = {
        include_docs: true,
        query: '(type:"Project") OR (type:"Task")',
        sort_on: [['project', 'ascending']]
      }, tasks = {};

      Logger.debug('Querying projects...');
      docQuery(jio, options).
        then(function (docs) {
          var i = 0;

          // Handlebars has very limited support for traversing data,
          // so we have to group/count everything in advance.

          for (i = 0; i < docs.length; i += 1) {
            if (docs[i].type === 'Project') {
              tasks[docs[i].project] = {tasks: [], task_count: 0};
            }
          }

          for (i = 0; i < docs.length; i += 1) {
            if (docs[i].type === 'Task') {
              tasks[docs[i].project] = tasks[docs[i].project] || {tasks: [], task_count: 0};
              tasks[docs[i].project].tasks.push(docs[i]);
              tasks[docs[i].project].task_count += 1;
            }
          }

          var template = Handlebars.compile($('#project-list-template').text());
          $('#project-list-container')
            .html(template({tasks: tasks}))
            .trigger('create'); // notify jqm of the changes we made
        });
      applyTranslation();
    });
  });


  /**
   * Attempt to parse a string to a (possibly partial) date.
   * The returned object can be directly fed to a query if
   * the right key_schema has been provided.
   *
   * @param {String} s The string to be parsed
   * @return {Object} a JIODate instance if possible, or null
   */
  var parseJIODate = function (s) {
    try {
      return jiodate.JIODate(s);
    } catch (e) {
      return null;
    }
  };


  /**
   * Display (or refresh) a list of tasks in the current page,
   * performing a search if there is search input.
   * Translation is applied after rendering the template.
   *
   * @param {Object} jio The storage instance
   * @param {String} sort_by name of the metadata property to sort on
   */
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

    var sort_on = [[sort_by || 'start', 'ascending']],
      options = {
        include_docs: true,
        wildcard_character: '%',
        sort_on: sort_on,
        query: query
      };

    Logger.debug('Querying tasks with: "%s" (%o)...', input_text, options.query);
    docQuery(jio, options).
      then(function (tasks) {
        Logger.debug('%i tasks found', tasks.length);
        var template = Handlebars.compile($('#task-list-template').text());
        $('#task-list-container')
          .html(template({tasks: tasks}))
          .trigger('create');
        applyTranslation();
      });
  };


  /**
   * Apply a sort order change to the task list, upon selection from the menu.
   */
  $(document).on('change', '#task-sortby', function () {
    var sort_by = $(this).val();
    jioConnect().then(function (jio) {
      updateTaskList(jio, sort_by);
    });
  });


  /**
   * Initial rendering of the 'task list' page.
   */
  $(document).on('pagebeforeshow', '#tasks-page', function () {
    Logger.debug('Loading Tasks page');
    jioConnect().then(function (jio) {
      // attempt to fix cosmetic issue with a select menu in the header
      $('#task-sortby-button').addClass('ui-btn-left');
      updateTaskList(jio);
    });
  });


  /**
   * Perform a search and update the task list.
   * A timer is used to avoid querying for each character.
   */
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


  /**
   * Redirects to the details page for a task, when a task is
   * clicked in the list.
   * Since we cannot pass the task id argument as a query
   * parameter (does not work with the appcache) we store it
   * in a closure variable.
   */
  $(document).on('click', '.task-details-link', function () {
    page_params = {task_id: $(this).data('jio-id')};
    Logger.info('task target id', page_params.task_id);
    $.mobile.navigate('task-details.html');
  });


  /**
   * Display the form to edit a single task's details,
   * or to create a new task.
   * Translation is applied after rendering the template.
   */
  $(document).on('pagebeforeshow', '#task-details-page', function () {
    jioConnect().then(function (jio) {
      Logger.debug('Loading Task Edit page');
      var project_options = {include_docs: true, sort_on: [['project', 'ascending']], query: '(type:"Project")'},
        projects_promise = docQuery(jio, project_options),
        task_promise = null,
        state_options = {include_docs: true, sort_on: [['state', 'ascending']], query: '(type:"State")'},
        states_promise = docQuery(jio, state_options);

      if (page_params.task_id) {
        task_promise = jio.get({_id: page_params.task_id});
        Logger.debug('Retrieving task %s', page_params.task_id);
        page_params = {};
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
            projects = responses[1],
            states = responses[2];

          var template = Handlebars.compile($('#task-details-template').text());
          $('#task-details-container')
            .html(template({task: task_resp.data, projects: projects, states: states}))
            .trigger('create');
          task_util.jqmSetSelected('#task-project', task_resp.data.project);
          task_util.jqmSetSelected('#task-state', task_resp.data.state);
          // XXX if the project does not exist anymore, the first one is selected
          applyTranslation();
        });
        // XXX handle failure (no task found)
    });
  });


  /**
   * Apply changes to the edited task, or create
   * a new task in the storage.
   */
  $(document).on('click', '#task-save', function () {
    jioConnect().then(function (jio) {
      var id = $('#task-id').val(),
        title = $('#task-title').val(),
        start = $('#task-start').val(),
        stop = $('#task-stop').val(),
        project = $('#task-project').val(),
        state = $('#task-state').val(),
        description = $('#task-description').val(),
        metadata = {},
        update_prom = null;

      // XXX validate input

      metadata = {
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
        metadata._id = id;
        update_prom = jio.put(metadata);
      } else {
        update_prom = jio.post(metadata);
      }

      update_prom.
        then(function (response) {
          Logger.debug('Updated task %o:', response.id);
          Logger.debug('  status %s (%s)', response.status, response.statusText);
          parent.history.back();
        });

    });
  });


  /**
   * Delete the currently open task from the storage.
   */
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


  /**
   * Update the settings form to edit project/state list.
   */
  var updateSettingsForm = function (jio) {
    var project_options = {include_docs: true, sort_on: [['project', 'ascending']], query: '(type:"Project")'},
      projects_promise = docQuery(jio, project_options),
      state_options = {include_docs: true, sort_on: [['state', 'ascending']], query: '(type:"State")'},
      states_promise = docQuery(jio, state_options);

    RSVP.all([projects_promise, states_promise]).
      then(function (responses) {
        var projects = responses[0],
          states = responses[1];

        var template = Handlebars.compile($('#settings-form-template').text());
        $('#settings-form-container')
          .html(template({projects: projects, states: states}))
          .trigger('create');
        applyTranslation();

        // select the current language on the menu
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


  /**
   * Retrieve all the storage metadata and configuration attachments.
   *
   * @param {Object} jio_config The configuration storage
   * @return {Promise} A Promise which resolves to a list
   * of objects {doc: {...}, config: {...}}
   */
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


  /**
   * Display the form to switch between storages
   */
  $(document).on('pagebeforeshow', '#storage-page', function () {
    jioConfigConnect().
      then(function (jio_config) {
        Logger.debug('Loading Storage page');
        storageConfigList(jio_config)
          .then(function (storage_config_list) {
            var template = Handlebars.compile($('#storage-form-template').text());

            $('#storage-form-container')
              .html(template({storage_config_list: storage_config_list}))
              .trigger('create');
            applyTranslation();

            // initialize the radio button with the previously selected, or default, value
            $('#storage-form input:radio[name=storage][value=' + getSelectedStorage() + ']').
              prop('checked', true).
              checkboxradio('refresh');
            // XXX handle failure (no config found)
          });
      });
  });


  /**
   * When a storage is selected, force the next jioConnect() call
   * to use its configuration.
   */
  $(document).on('change', 'input:radio[name=storage]', function () {
    setSelectedStorage($(this).val());
    _jio_tasks = null;
    Logger.debug('Switching storage to', getSelectedStorage());
  });


  /**
   * Redirects to the details page for the selected storage.
   * Since we cannot pass the task id argument as a query
   * parameter (does not work with the appcache) we store it
   * in a closure variable.
   */
  $(document).on('click', '#settings-edit-storage', function () {
    page_params = {storage_id: $('#storage-form input:radio[name=storage]:checked').val()};
    $.mobile.navigate('storage-details.html');
  });


  /**
   * Retrieve a single storage's configuration,
   * or provide the default value for a configuration object.
   *
   * @param {Object} jio_config The configuration storage
   * @param {String} id The id of the configuration to retrieve (may be null)
   * @return {Promise} A Promise which resolves to the
   * configuration object.
   */
  var storageConfig = function (jio_config, id) {
    return new RSVP.Promise(function (resolve) {
      if (id) {
        jio_config.get({_id: id}).
          then(function (response) {
            var promise = jio_config.
              getAttachment({_id: response.id, _attachment: 'config'}).
              then(function (response) {
                return jIO.util.readBlobAsText(response.data);
              }).
              then(function (ev) {
                return JSON.parse(ev.target.result);
              });
            resolve(promise);
          });
      } else {
        resolve({
          storage_type: 'local'
        });
      }
    });
  };


  /**
   * Display the form to edit a single storage's details,
   * or to create a new storage.
   * Translation is applied after rendering the template.
   */
  $(document).on('pagebeforeshow', '#storage-details-page', function () {
    jioConfigConnect().then(function (jio_config) {
      var id = page_params.storage_id;
      Logger.debug('Loading Storage Edit page:', id);
      page_params = {};

      storageConfig(jio_config, id).
        then(function (config) {
          var template = Handlebars.compile($('#storage-details-template').text());
          $('#storage-details-container')
            .html(template({id: id, config: config, default_storage_id: default_storage_id}))
            .trigger('create');
          applyTranslation();
        });

    });
  });


  /**
   * Apply changes to the edited storage configuration,
   * or create a new one.
   */
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


  /**
   * Delete the currently open storage configuration.
   * Does not actually touch the storage's content, and resets
   * the selected storage to the default one.
   */
  $(document).on('click', '#storage-delete', function () {
    jioConfigConnect().then(function (jio_config) {
      var id = $('#storage-id').val();

      jio_config.remove({_id: id}).
        then(function (response) {
          Logger.debug('Deleted storage %o:', response.id);
          Logger.debug('  status %s', response.status);
          setSelectedStorage(default_storage_id);
          $.mobile.navigate('storage.html');
        }).
        fail(function (error) {
          errorDialog(error);
        });
    });
  });



  /**
   * Delete a state.
   */
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


  /**
   * Create a new state. XXX Does not check for duplicates.
   */
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



  /**
   * Delete a project. XXX even if it contains tasks
   */
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


  /**
   * Create a new project. XXX Does not check for duplicates.
   */
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

