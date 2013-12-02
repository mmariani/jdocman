/*jslint indent: 2, nomen: true, vars: true */
/*global require, console, define, document, alert */

define(
  [
    'jquery',
    'jio',
    'rsvp',
    'logger',
    'handlebars',
    // jio dependencies
    'davstorage',
    'sha256',
    'localstorage',
    // jquery mobile
    'jqm',
    // requirejs plugins
    'json',
    'text',
    'css',
    // 'css!jqm/jquery.mobile-1.4.0-rc.1.css',   // XXX does not work
    'css!modules/taskman.css'
  ],
  function ($, jIO, RSVP, Logger, Handlebars, davstorage) {
    "use strict";

    var jio_config = null,
      jio_tasks = null,
      taskman = {};

    Logger.useDefaults();   // log to console
    Logger.setLevel(Logger.DEBUG);    // XXX should be WARN for production

    RSVP.EventTarget.mixin(taskman);

    Handlebars.registerHelper('trimDate', function (date) {
      return new Handlebars.SafeString(date.substring(0, 10));
    });

    var TYPES = {
      Project: 'Project',
      State: 'State',
      Task: 'Task'
    };

    var uuid = function () {
      var S4 = function () {
        return ('0000' + Math.floor(Math.random() * 0x10000).toString(16)).slice(-4);
      };
      return S4() + S4() + '-' + S4() + '-' + S4() + '-' + S4() + '-' + S4() + S4() + S4();
    };

    var populateInitialStorage = function (jio) {
      Logger.info('Populating initial storage...');
      require(['json!data/tasks.json'], function (data) {

        var objs = Array.prototype.concat(data.projects, data.states, data.tasks);

        Logger.debug('Inserting %i objects..', objs.length);
        objs.map(function (obj) {
          obj.reference = uuid();
          obj.modified = new Date();

          jio.post(obj)
            .then(function (response) {
              Logger.debug('Inserted %s: %o', obj.type, obj);
              // XXX handle failure
            });
        });

      });
    };

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
    });

    $(document).on('pagebeforeshow.tasks', '#tasks-page', function (ev, data) {
      // XXX also trigger when directly loading this page, after everything is set up
      Logger.info('Loading Tasks page');

      var options = {
        include_docs: true,
        query: '(type:"Task")'
      };

      Logger.debug('Querying tasks...');
      jio_tasks.allDocs(options)
        .then(function callback(response) {
          Logger.debug('%i tasks found', response.data.total_rows);
          var template = Handlebars.compile($('#task-list-template').text());
          $('#task-list-container')
            .html(template(response.data))
            .trigger('create');
        });
    });

    $(document).on('pagebeforeshow.settings', '#settings-page', function (ev, data) {
      // XXX also trigger when directly loading this page, after everything is set up
      Logger.info('Loading Settings page');
    });

    var connectStorage = function () {
      // connect to the configured storage
      jio_config.allDocs({include_docs: true})
        .then(function callback(response) {
          // XXX only considers the first document from jio_config
          // (but there can be only one, right?)
          console.assert(response.data.total_rows === 1);
          var config = response.data.rows[0].doc,
            storage_description = storageDescription(config),
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
