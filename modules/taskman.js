/*jslint indent: 2, nomen: true */
/*global require, console, define */

define(
  [
    'jquery',
    'jio',
    'sha256',
    'jqm',
    'json',
    'text',
    'css',
    // 'css!jqm/jquery.mobile-1.4.0-rc.1.css',   // XXX does not work
    'css!modules/taskman.css'
  ],
  function ($, jIO) {
    "use strict";

    var populate_initial_storage = function(jio) {
      console.log('Populating storage...');
      require(['json!data/tasks.json'], function(data) {
        var projects = data.projects,
            states = data.states,
            tasks = data.tasks;
          console.log('Projects: %o', projects);
          console.log('States: %o', states);
          console.log('Tasks: %o', tasks);
      });
    };


    var taskman = {};

    taskman.run = function () {
      console.log('Starting taskman');

      var jio = jIO.createJIO({
        'type': 'local',
        'username': 'Admin',
        'application_name': 'TASK-MANAGER'
      });

      console.log('opened jio: %o', jio);

      $('#reset-data-btn').on('click', function (ev) {
        jio.allDocs().then(function callback (response) {
          populate_initial_storage(jio);
            // console.log(response);
        }, function errback (error) {
          console.log(error);
          $(document).on('pagebeforeshow.errordialog', '#errordialog', function(ev, data) {
            $(ev.target).find('.error-header').html(error.statusText);
            $(ev.target).find('.error-message').html(error.message);
            $(document).off('pagebeforeshow.errordialog');
          });
          $.mobile.changePage('errordialog.html', { role: "dialog" } );
        });
        jio.allDocs({'include_docs': true})
      });

    };

    return taskman;
  }
);
