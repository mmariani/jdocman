/*jslint indent: 2, nomen: true, vars: true */
/*global require, console, define, document, alert, window */

define(
  [
    'jquery',
    'jio',
    'rsvp',
    'logger',
    'handlebars',
    'task_util',
    'i18next',
    'moment',
    // jio dependencies
    'jiodate',
    'davstorage',
    'sha256',
    'localstorage',
    // requirejs plugins
    'json',
    'text',
    'css',
    // 'css!jqm/jquery.mobile-1.4.0-rc.1.css',   // XXX does not work
    'css!modules/taskman.css'
  ],
  function ($, jIO, RSVP, Logger, Handlebars, task_util, i18next, moment, jiodate, davstorage) {
    "use strict";

    var jio_config = null,
      jio_tasks = null,
      taskman = {},
      input_timer = null;

    require(['jqm']);

    Logger.useDefaults();   // log to console
    Logger.setLevel(Logger.DEBUG);    // XXX should be WARN for production

    RSVP.EventTarget.mixin(taskman);

    task_util.registerHelpers();

    // Immediately apply translation to all elements which have a data-i18n attribute.
    var applyTranslation = function () {
      $('[data-i18n]').i18n();
    };

    // Initial setup for translation
    $.i18n.init({
      detectLngQS: 'lang',
      fallbackLng: 'fr',
      ns: 'translation',
      resGetPath: 'i18n/__lng__/__ns__.json',
      preload: ['en', 'fr', 'zh']
    }, function (t) {
      applyTranslation();
    });

    var TYPES = {
      Project: 'Project',
      State: 'State',
      Task: 'Task'
    };

    var populateInitialStorage = function (jio) {
      Logger.info('Populating initial storage...');
      require(['json!data/tasks.json'], function (data) {

        var objs = Array.prototype.concat(data.projects, data.states, data.tasks);

        Logger.debug('Inserting %i objects..', objs.length);
        objs.map(function (obj) {
          obj.reference = task_util.createUUID();
          obj.modified = new Date();

          jio.post(obj)
            .then(function (response) {
              Logger.debug('Inserted %s: %o', obj.type, obj);
              // XXX handle failure
            });
        });

      });
    };


    $('#translate').on('change', function () {
      var curr_lang = $(this).val();
      $.i18n.setLng(curr_lang, function () {
        applyTranslation();
      });
    });


    taskman.on('task_storage_connected', function (event) {
      // Create the UI
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
//    RSVP.on('error', function(event) {
//      console.assert(false, event.detail);
//    });

    var createInitialConfig = function () {
      Logger.debug('Creating configuration...');
      return jio_config.post({
        'reference': 'baeba5b3-dec7-c06e-1ae3-49585b5bd938',
        'modified': new Date(),
        'storage_type': 'local',
        'username': 'Admin',
        'application_name': 'TASK-MANAGER',
        'type': 'Task Report',
        'url': '',
        'realm': ''
      });

    };


    var errorDialog = function (error) {
      // display an 'error' object as received by jIO methods
      // XXX there must be a better way to fill the content.
      $(document).on('pagebeforeshow.errordialog', '#errordialog', function (ev, data) {
        $(ev.target).find('.error-header').html(error.statusText);
        $(ev.target).find('.error-message').html(error.message);
        $(document).off('pagebeforeshow.errordialog');
      });
      $.mobile.changePage('errordialog.html', {role: 'dialog'});
    };

    var deleteStorageContent = function (jio) {
      jio.allDocs().then(function callback(response) {
        var i, id, rows_length = response.data.rows.length;
        for (i = 0; i < rows_length; i += 1) {
          id = response.data.rows[i].id;
          Logger.debug('Removing: %s on storage %o', id, jio);
          jio.remove({'_id': id});
        }
      });
    };

    $('#btn-reset-data').on('click', function (ev) {
      // remove configuration and everything.
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

    var storageDescription = function (config) {
      // returns a storage description according to a configuration document.
      if (config.storage_type === 'local') {
        return {
          'type': 'local',
          'username': config.username,
          'application_name': config.application_name
        };
      }

      if (config.storage_type === 'dav') {
        return davstorage.createDescription({
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


    $(document).on('pagebeforeshow.projects', '#projects-page', function (ev, data) {
      // XXX also trigger when directly loading this page, after everything is set up
      Logger.info('Loading Projects page');

      var options = {
        include_docs: true,
        query: '(type:"Project")'
      };

      Logger.debug('Querying projects...');
      jio_tasks.allDocs(options)
        .then(function callback(response) {
          Logger.debug('%i projects found', response.data.total_rows);
          var template = Handlebars.compile($('#project-list-template').text());
          $('#project-list-container')
            .html(template(response.data))
            .trigger('create');
        });
      applyTranslation();
    });

    var parseDate = function (s) {
      try {
        return jiodate.JIODate(s);
      } catch (e) {
        return null;
      }
    };

    var update_tasks_list = function () {
      var input_text = $('#search-tasks').val(),
//          query = '(type: "Task")' + (input_text ? ' AND (' + input_text + ')' : '');

        search_string = input_text ? '%' + input_text + '%' : '%',
        query = null,
        search_date = parseDate(input_text),      // ? moment(input_text).format('YYYY-MM-DD') : null,
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
        Logger.info('Search for date: %o', search_date);

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
        });
    };

    $(document).on('pagebeforeshow.tasks', '#tasks-page', function (ev) {
      Logger.info('Loading Tasks page');
      update_tasks_list();
      applyTranslation();
    });

    $(document).on('click', '#search-trigger', function (ev) {
      update_tasks_list();
    });


    $(document).on('input', '#search-tasks', function (ev) {
      if (input_timer) {
        window.clearTimeout(input_timer);
        input_timer = null;
      }
      input_timer = window.setTimeout(function () {
        // var search_string = $(ev.target).val();
        update_tasks_list();
        input_timer = 0;
      }, 500);
    });


    $(document).on('pagebeforeshow.task', '#task-edit-page', function (ev, data) {
      // XXX also trigger when directly loading this page, after everything is set up
      Logger.info('Loading Task Edit page');
      // XXX location.search may not work in Phonegap
      // TODO sanitize params.id

      var params = task_util.parseParams(window.location.search),
        projects_promise = jio_tasks.allDocs({include_docs: true, query: '(type:"Project")'}),
        task_promise = jio_tasks.get({'_id': params.id}),
        states_promise = jio_tasks.allDocs({include_docs: true, query: '(type:"State")'});

      Logger.debug('Retrieving task %s', params.id);

      RSVP.all([task_promise, projects_promise, states_promise])
        .then(function callback(responses) {
          var task_resp = responses[0],
            projects_resp = responses[1],
            states_resp = responses[2];

          var template = Handlebars.compile($('#task-edit-template').text());
          $('#task-edit-container')
            .html(template({'task': task_resp.data, 'projects': projects_resp.data.rows, 'states': states_resp.data.rows}))
            .trigger('create');
          Logger.info('Selecting: %s', task_resp.data.project);
          task_util.jqmSetSelected('#project-select', task_resp.data.project);
          // XXX if the project does not exist anymore, the first one is selected
          applyTranslation();
        });
        // TODO handle failure (no task found)
    });


    $(document).on('pagebeforeshow.settings', '#settings-page', function (ev, data) {
      // XXX also trigger when directly loading this page, after everything is set up
      Logger.info('Loading Settings page');

      var projects_promise = jio_tasks.allDocs({include_docs: true, query: '(type:"Project")'}),
        states_promise = jio_tasks.allDocs({include_docs: true, query: '(type:"State")'});

      RSVP.all([projects_promise, states_promise])
        .then(function callback(responses) {
          var projects_resp = responses[0],
            states_resp = responses[1];

          var template = Handlebars.compile($('#settings-edit-template').text());
          $('#settings-edit-container')
            .html(template({'projects': projects_resp.data.rows, 'states': states_resp.data.rows}))
            .trigger('create');
          applyTranslation();
        });
        // TODO handle failure (no task found)
    });


    var accentFold = function (s) {
      var map = [
          [new RegExp('[àáâãäå]', 'gi'), 'a'],
          [new RegExp('æ', 'gi'), 'ae'],
          [new RegExp('ç', 'gi'), 'c'],
          [new RegExp('[èéêë]', 'gi'), 'e'],
          [new RegExp('[ìíîï]', 'gi'), 'i'],
          [new RegExp('ñ', 'gi'), 'n'],
          [new RegExp('[òóôõö]', 'gi'), 'o'],
          [new RegExp('œ', 'gi'), 'oe'],
          [new RegExp('[ùúûü]', 'gi'), 'u'],
          [new RegExp('[ýÿ]', 'gi'), 'y']
        ];

      map.forEach(function (o) {
        var rep = function (match) {
          if (match.toUpperCase() === match) {
            return o[1].toUpperCase();
          }
          return o[1];
        };
        s = s.replace(o[0], rep);
      });
      return s;
    };


    var connectStorage = function () {
      // connect to the configured storage
      jio_config.allDocs({include_docs: true})
        .then(function callback(response) {
          // XXX only considers the first document from jio_config
          // (but there can be only one, right?)
          console.assert(response.data.total_rows === 1);
          var config = response.data.rows[0].doc,
            storage_description = storageDescription(config),
            key_schema = {
              cast_lookup: {
                dateType: jiodate.JIODate
              },
              match_lookup: {
                translatedStateMatch: function (object_value, value) {
                  var translated_object_value = i18next.t(object_value);
                  return accentFold(translated_object_value).toLowerCase() === accentFold(value.toLowerCase());
                }
              },
              key_set: {
                start: {
                  read_from: 'start',
                  cast_to: 'dateType'
                },
                stop: {
                  // XXX this should actually be the end of month/year/whatever...
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
            .then(function (response) {
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

    return taskman;
  }
);
