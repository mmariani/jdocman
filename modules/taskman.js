/*jslint indent: 2, nomen: true, vars: true, browser: true */
/*global alert, require, $, Logger, RSVP, task_util, dav_storage, Handlebars, jiodate, moment, i18n, jIO */

$(document).on('mobileinit', function () {
  "use strict";

  var jio_config = null,
    jio_tasks = null,
    taskman = {},
    input_timer = null,
    details_id_target = null;   // parameter for details.html -- we cannot use URL parameters with appcache

  $.mobile.selectmenu.prototype.options.nativeMenu = false;

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


  //
  // Fill with default/test data
  //
  var populateInitialStorage = function (jio) {
    Logger.info('Populating initial storage...');
    require(['json!data/tasks.json'], function (data) {

      var objs = Array.prototype.concat(data.projects, data.states, data.tasks);

      Logger.debug('Inserting %i objects..', objs.length);
      objs.map(function (obj) {
        obj.modified = new Date();

        jio.post(obj)
          .then(function () {  // (response)
            Logger.debug('Inserted %s: %o', obj.type, obj);
            // XXX handle failure
          });
      });

    });
  };


  // dialogs are transparent

  /*jslint unparam: true*/
  $(document).on('pagebeforeshow', 'div[data-role="dialog"]', function (e, ui) {
    ui.prevPage.addClass("ui-dialog-background ");
  });

  $(document).on('pagehide', 'div[data-role="dialog"]', function (e, ui) {
    $(".ui-dialog-background ").removeClass("ui-dialog-background ");
  });
  /*jslint unparam: false*/


  //
  // Create the UI
  //
  taskman.on('task_storage_connected', function (event) {
    jio_tasks = event.detail;

    jio_tasks.allDocs().then(function callback(response) {
      var total_rows = response.data.total_rows;
      Logger.info('Found %i objects.', total_rows);

      if (total_rows === 0) {
        populateInitialStorage(jio_tasks);
      }
    });
  });


// XXX can we log all failed promises?
//    RSVP.on('error', function (event) {
//      console.assert(false, event.detail);
//    });

  var createInitialConfig = function () {
    Logger.debug('Creating configuration...');
    return jio_config.post({
      'modified': new Date(),
      'storage_type': 'local',
      'username': 'Admin',
      'application_name': 'TASK-MANAGER',
      'type': 'Task Report',
      'url': '',
      'realm': ''
    });

  };


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
    $.mobile.changePage('errordialog.html', {role: 'dialog'});
  };

  //
  // Remove all data from a storage.
  //
  var deleteStorageContent = function (jio) {
    jio.allDocs().then(function callback(response) {
      var i, id, rows_length = response.data.rows.length;
      for (i = 0; i < rows_length; i += 1) {
        id = response.data.rows[i].id;
        Logger.debug('Removing: %s on storage %o', id, jio);
        jio.remove({_id: id});
      }
    });
  };

  //
  // Remove test data, must reload to create again.
  //
  $(document).on('click', '#btn-reset-data', function () {
    Logger.info('Clearing tasks storage.');
    if (jio_tasks) {
      deleteStorageContent(jio_tasks);
      jio_tasks = null;
    } else {
      Logger.info('Tasks storage is already empty.');
    }
    Logger.info('Clearing configuration storage.');
    deleteStorageContent(jio_config);
    // XXX: repopulate by reloading
  });

  //
  // Return a storage description according to a configuration document.
  //
  var storageDescription = function (config) {
    if (config.storage_type === 'local') {
      return {
        'type': 'local',
        'username': config.username,
        'application_name': config.application_name
      };
    }

    if (config.storage_type === 'dav') {
      return dav_storage.createDescription({
        'url': config.url,
        'auth_type': config.auth_type,
        'realm': config.realm,
        'username': config.username,
        'password': config.password
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
            default: {
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
            default: {
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


  $(document).on('pagebeforeshow', '#projects-page', function () {
    Logger.debug('Loading Projects page');

    var options = {
      include_docs: true,
      query: '(type:"Project") OR (type:"Task")',
      sort_on: [['project', 'ascending']]
    }, tasks = {};

    Logger.debug('Querying projects...');
    jio_tasks.allDocs(options)
      .then(function callback(response) {
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

  var parseJIODate = function (s) {
    try {
      return jiodate.JIODate(s);
    } catch (e) {
      return null;
    }
  };

  var updateTaskList = function (sort_by) {
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
    jio_tasks.allDocs(options)
      .then(function callback(response) {
        Logger.debug('%i tasks found', response.data.total_rows);
        var template = Handlebars.compile($('#task-list-template').text());
        $('#task-list-container')
          .html(template(response.data))
          .trigger('create');
        applyTranslation();
      });
  };


  $(document).on('change', '#task-sortby', function () {
    var sort_by = $(this).val();
    updateTaskList(sort_by);
  });


  $(document).on('pagebeforeshow', '#tasks-page', function () {
    Logger.debug('Loading Tasks page');
    $("#task-sortby-button").addClass("ui-btn-left");
    updateTaskList();
    applyTranslation();
  });


  $(document).on('input', '#search-tasks', function () {
    if (input_timer) {
      window.clearTimeout(input_timer);
      input_timer = null;
    }
    input_timer = window.setTimeout(function () {
      updateTaskList();
      input_timer = 0;
    }, 500);
  });



  $(document).on('click', '.details-link', function () {
    details_id_target = $(this).data('jio-id');
    $.mobile.changePage('details.html');
  });


  $(document).on('pagebeforeshow', '#details-page', function () {
    Logger.debug('Loading Task Edit page');
    // XXX location.search may not work in Phonegap

    var projects_promise = jio_tasks.allDocs({include_docs: true, sort_on: [['project', 'ascending']], query: '(type:"Project")'}),
      task_promise = null,
      states_promise = jio_tasks.allDocs({include_docs: true, sort_on: [['state', 'ascending']], query: '(type:"State")'});

    if (details_id_target) {
      task_promise = jio_tasks.get({_id: details_id_target});
      Logger.debug('Retrieving task %s', details_id_target);
      details_id_target = null;
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

    RSVP.all([task_promise, projects_promise, states_promise])
      .then(function callback(responses) {
        var task_resp = responses[0],
          projects_resp = responses[1],
          states_resp = responses[2];

        var template = Handlebars.compile($('#details-template').text());
        $('#details-container')
          .html(template({'task': task_resp.data, 'projects': projects_resp.data.rows, 'states': states_resp.data.rows}))
          .trigger('create');
        task_util.jqmSetSelected('#task-project', task_resp.data.project);
        task_util.jqmSetSelected('#task-state', task_resp.data.state);
        // XXX if the project does not exist anymore, the first one is selected
        applyTranslation();
      });
      // XXX handle failure (no task found)
  });




  //
  // Create/Modify a task
  //
  $(document).one('click', '#task-save', function () {
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
      jio_tasks.put(doc).
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
      jio_tasks.post(doc).
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


  //
  // Delete a task
  //
  $(document).on('click', '#task-delete', function () {
    var id = $('#task-id').val();

    jio_tasks.remove({_id: id}).
      then(function (response) {
        Logger.debug('Deleted task %o:', response.id);
        Logger.debug('  status %s', response.status);
        parent.history.back();
        // XXX explicit redirect
      }).
      fail(function () {
        // XXX not working
        // errorDialog(error);
        return;
      });
  });


  //
  // Update form for editing project / state list
  //
  var updateSettingsForm = function () {
    var projects_promise = jio_tasks.allDocs({include_docs: true, sort_on: [['project', 'ascending']], query: '(type:"Project")'}),
      states_promise = jio_tasks.allDocs({include_docs: true, sort_on: [['state', 'ascending']], query: '(type:"State")'});

    RSVP.all([projects_promise, states_promise])
      .then(function callback(responses) {
        var projects_resp = responses[0],
          states_resp = responses[1];

        var template = Handlebars.compile($('#settings-edit-template').text());
        $('#settings-edit-container')
          .html(template({'projects': projects_resp.data.rows, 'states': states_resp.data.rows}))
          .trigger('create');
        applyTranslation();

        // update select menu with current selected language
        task_util.jqmSetSelected('#translate', i18n.lng());
      });
      // XXX handle failure (no task found)
  };

  $(document).on('pagebeforeshow', '#settings-page', function () {
    Logger.debug('Loading Settings page');

    updateSettingsForm();
  });


  //
  // Delete a state
  //
  $(document).on('click', '#settings-del-state', function () {
    var $selected = $('input:checkbox:checked[name|=state]');
    /*jslint unparam: true*/
    $selected.each(function (i, el) {
      jio_tasks.remove({_id: el.value});
    });
    /*jslint unparam: false*/
    updateSettingsForm();

// XXX shouldn't remove() return a promise ?
//        del_promises = $selected.map(function (i, el) {
//          return jio_tasks.remove({_id: el.value});
//        });
//
//      RSVP.all(del_promises).then(function() {
//        debugger;
//      });
//      // XXX handle failure
  });


  //
  // Add a state
  //
  $(document).on('click', '#settings-add-state', function () {
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

    jio_tasks.post(doc).
      then(function (response) {
        Logger.debug('Added state: %o', response.id);
        Logger.debug('  status %s (%s)', response.status, response.statusText);
        updateSettingsForm();
      });
      // XXX handle failure
  });



  //
  // Delete a project
  //
  $(document).on('click', '#settings-del-project', function () {
    var $selected = $('input:checkbox:checked[name|=project]');

    /*jslint unparam: true*/
    $selected.each(function (i, el) {
      jio_tasks.remove({_id: el.value});
    });
    /*jslint unparam: false*/
    updateSettingsForm();
  });


  //
  // Add a project
  //
  $(document).on('click', '#settings-add-project', function () {
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

    jio_tasks.post(doc).
      then(function (response) {
        Logger.debug('Added project: %o', response.id);
        Logger.debug('  status %s (%s)', response.status, response.statusText);
        updateSettingsForm();
      });
      // XXX handle failure
  });


  //
  // connect to the configured storage
  //
  var connectStorage = function () {
    jio_config.allDocs({include_docs: true})
      .then(function callback(response) {
        //
        // Only considers the first document from jio_config,
        // but there can be only one
        //
        var config = response.data.rows[0].doc,
          storage_description = storageDescription(config),
          key_schema = {
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
          },
          jio = null;

        storage_description.key_schema = key_schema;
        jio = jIO.createJIO(storage_description);
        Logger.debug('Connecting to tasks jIO: %o', storage_description);
        taskman.trigger('task_storage_connected', {detail: jio});
      });
  };


  jio_config = jIO.createJIO({
    'type': 'local',
    'username': 'Admin',
    'application_name': 'TASK-MANAGER_config'
  });


  //////////////////////////////////////////////////////////////////////////


  taskman.run = function () {
    Logger.debug('Starting taskman');

    Logger.debug('Opened config jio: %o', jio_config);

    //
    // either load configuration from local storage, or create it
    //
    jio_config.allDocs().then(function callback(response) {
      if (response.data.total_rows === 0) {
        Logger.debug('No configuration found, populating initial storage');
        // XXX how can we tell a new storage from an empty one?
        createInitialConfig()
          .then(function () {
            Logger.info('Configuration created.');
            connectStorage();
          }, function (error) {
            Logger.error('Unable to create configuration (%o).', error);
            errorDialog(error);
          });
      } else {
        Logger.debug('Configuration found: %o', response.data.rows);
        connectStorage();
      }
    }, function errback(error) {
      // XXX display the error (i.e. if no storage module exists).
      errorDialog(error);
    });

  };

  taskman.run();
});

