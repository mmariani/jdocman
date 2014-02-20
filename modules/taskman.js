/*jslint indent: 2, nomen: true, vars: true, browser: true */
/*global $, Logger, RSVP, dav_storage, Handlebars, jiodate, moment, i18n, jIO, task_data, Blob, complex_queries, Sanitize  */

$(document).on('mobileinit', function () {
  "use strict";

  var USE_FULLSCREEN_WIDGET = false;

  Logger.useDefaults();   // log to console

  // DEBUG for development, WARN for production
  Logger.setLevel(Logger.DEBUG);


  /**
   * Creates a function to use for (case insensitive) accent folding.
   *
   * @param {String} map an array of (regexp, string) to do the conversion.
   * @return {Function} the folding function.
   */
  function AccentFolder(map) {
    return function accentFoldLC(s) {
      if (!s) {
        return s;
      }
      map.forEach(function (o) {
        var rep = function (match) {
          if (match.toUpperCase() === match) {
            return o[1].toUpperCase();
          }
          return o[1];
        };
        s = s.replace(o[0], rep);
      });
      return s.toLowerCase();
    };
  }


  var accentFoldLC = new AccentFolder([
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
    ]),
    //
    // Define a schema of search keys for the task queries,
    // as described in http://jio.readthedocs.org/en/latest/keys.html
    // This schema implements filtering with partial dates, titles and descriptions
    // regardless of the accents and letter case, and translated state values.
    //
    key_schema = {
      cast_lookup: {
        dateType: jiodate.JIODate
      },
      match_lookup: {
        translatedStateMatch: function (object_value, value) {
          var translated_object_value = i18n.t(object_value);
          return RSVP.resolve(accentFoldLC(translated_object_value) ===
                              accentFoldLC(value));
        }
      },
      key_set: {
        title: {
          read_from: 'title',
          cast_to: accentFoldLC
        },
        description: {
          read_from: 'description',
          cast_to: accentFoldLC
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
    //
    // Data passed around for page changes -- we cannot use URL parameters with appcache
    // Waiting for better parameter support in JQM 1.5 (http://jquerymobile.com/roadmap/)
    //
    default_storage_id = 'default_storage';



  /****************************************
   *                                      *
   * Most function definitions start here *
   *                                      *
   ****************************************/


  function getSelectedStorage() {
    return localStorage.getItem('jio_selected_storage');
  }


  function setSelectedStorage(val) {
    return localStorage.setItem('jio_selected_storage', val);
  }


  /**
   * Immediately apply translation to all elements
   * which have a data-i18n attribute.
   */
  function applyTranslation() {
    $('[data-i18n]').i18n();
  }


  /**
   * Detect if the browser has native support for <input type="date">
   *
   * @return {Boolean} true if the browser has a datepicker, false otherwise.
   */
  function hasHTML5DatePicker() {
    var el = document.createElement('input');
    el.setAttribute('type', 'date');
    return el.type !== 'text';
  }


  /**
   * Update a <select> element's selected option,
   * then activates the jquery mobile event to refresh UI
   */
  function jqmSetSelected(element, value) {
    var $select = $(element);

    /*jslint unparam: true*/
    $select.children().each(function (i, op) {
      if (op.getAttribute('value') === value) {
        op.setAttribute('selected', 'selected');
      }
    });
    /*jslint unparam: false*/

    $select.selectmenu('refresh');
  }


  /**
   * Retrieves the text typed by the user for searching.
   *
   * @return {String} the search string
   */
  function getSearchString() {
    return $('#search-tasks').val().trim();
  }


  /**
   * Display an error's title and message, within a JQM modal popup,
   * as received by jIO methods.
   * In case of exception, shows the stack trace.
   * This function can be used as a then parameter.
   *
   *     doSomething().then(...).fail(displayError);
   */
  function displayError(error) {
    var header = error.statusText || 'Application error',
      message = error.stack ? ('<pre>' + error.stack + ' </pre>') : error.message,
      popup_template = (
        '<div data-role="popup" data-theme="a" id="errorPopup" data-dismissible="false" data-history="false" style="max-width:400px;">' +
        '  <div role="main" class="ui-content">' +
        '    <h3 class="ui-title">{{message}}</h3>' +
        '    <p>{{sanitize details}}</p>' +
        '    <a href="#errorPopup" class="ui-btn ui-corner-all ui-shadow ui-btn-inline data-rel="close">{{button_text}}</a>' +
        '  </div>' +
        '</div>'
      ),
      template = Handlebars.compile(popup_template);

    var html = template({
      header: 'Error',
      message: header,
      details: message,
      button_text: 'Ok'
    });

    var $container = $('#errorPopupContainer');

    if ($container.length === 0) {
      $container = $('<div id="errorPopupContainer">');
      $(document.body).append($container);
    }

    $container.html(html).trigger('create');
    $('#errorPopup').popup('open');
    $('#errorPopup').bind({
      popupafterclose: function () {
        $('#errorPopup').remove();
      }
    });

  }


  /**
   * This function must be used as a progress parameter if you don't want to
   * propagate notifications.
   *
   *     doSomething().progress(stopProgressPropagation).then(...);
   */
  function stopProgressPropagation() {
    // stop progress propagation
    throw new Error('Progress stopped');
  }


  var _jio_config = null;
  var _jio_config_promise = null;

  /**
   * This function creates the global _jio_config instance bound to localStorage
   * and, if the storage is empty, inserts some hard coded configurations.
   * The returned promise will have _jio_config as fulfillment value or undefined,
   * and it will never be rejected.
   * This promise is not cancellable and sends no notifications.
   *
   * @return {Promise} The promise < _jio_config, post_error >
   */
  function jioConfigConnect() {
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
      then(null, displayError, stopProgressPropagation);
    return _jio_config_promise;
  }


  /**
   * Creates a storage description from to a configuration object.
   */
  function storageDescription(config) {
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
    window.alert('unsupported storage type: ' + config.storage_type);
  }


  /**
   * If a storage is empty, inserts default/test data
   * with projects, states, and tasks.
   */
  function populateInitialTasksIfNeeded(jio) {
    return jio.allDocs().
      then(function (response) {
        if (response.data.total_rows) {
          Logger.debug('The storage contains data.');
          return RSVP.resolve();
        }

        var obj_list = Array.prototype.concat(task_data.projects, task_data.states, task_data.tasks),
          ins_promise_list = obj_list.map(function (obj) {
            obj.modified = new Date();
            Logger.debug('Inserting %s: %o', obj.type, obj);
            return jio.post(obj);
          });

        Logger.info('The storage is empty. Populating with %i objects...', ins_promise_list.length);
        return RSVP.all(ins_promise_list);
      });
  }


  var _jio = null;
  var _jio_promise = null;

  /**
   * This function creates the global _jio instance bound to the
   * main storage and, if the storage is empty, inserts some hard coded
   * projects and tasks.
   * The returned promise will have _jio as fulfillment value or undefined,
   * and it will never be rejected.
   * This promise is not cancellable and sends no notifications.
   *
   * @return {Promise} The promise < _jio, post_error >
   */
  function jioConnect() {
    if (_jio) {
      return RSVP.resolve(_jio);
    }
    if (_jio_promise) {
      // another call to jioConnect() has been made,
      // but the promise has not resolved yet, so we return it again
      return _jio_promise;
    }
    _jio_promise = jioConfigConnect().
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
        _jio = jIO.createJIO(storage_description);
        return populateInitialTasksIfNeeded(_jio);
      }).
      then(function () {
        return _jio;
      }).
      then(null, displayError, stopProgressPropagation);
    return _jio_promise;
  }


  /**
   * Remove all data from a storage.
   *
   * @param {Object} jio The storage to clear
   */
  function deleteStorageContent(jio) {
    return jio.allDocs().then(function (response) {
      var del_promise_list = response.data.rows.map(function (row) {
        Logger.debug('Removing: %s on storage %o', row.id, jio);
        return jio.remove({_id: row.id});
      });
      return RSVP.all(del_promise_list).then(function () {
        Logger.debug('%i object(s) have been removed from %o', del_promise_list.length, jio);
      });
    });
  }


  /**
   * Perform a query with allDocs(), and return a promise
   * that resolves to the list of 'doc' objects.
   *
   * @param {Object} jio the storage instance to use
   * @param {Object} options the argument to use with allDocs()
   * @return {Promise} A Promise which resolves to a list of 'doc' objects
   */
  function docQuery(jio, options) {
    return jio.allDocs(options).
      then(function (response) {
        return RSVP.resolve(response.data.rows.map(function (row) {
          return row.doc;
        }));
      });
  }


  /**
   * Check if a project already exists.
   *
   * @param {Object} jio the storage instance to use
   * @param {String} project name of the project to look up
   * @return {Promise} A promise that resolved to true
   * if the project exists, false otherwise.
   */
  function checkProjectExists(jio, project) {
    return jio.allDocs({
      query:  {
        type: 'complex',
        operator: 'AND',
        query_list: [
          {
            type: 'simple',
            key: 'type',
            value: 'Project'
          }, {
            type: 'simple',
            key: 'project',
            operator: '=',
            value: project
          }
        ]
      }
    }).then(function (response) {
      return RSVP.resolve(response.data.total_rows >= 1);
    });
  }


  /**
   * Count the tasks with a given state.
   *
   * @param {Object} jio the storage instance to use
   * @param {String} state name of the state to look up
   * @return {Promise} A promise that resolved to the
   * number of tasks with that state.
   */
  function countStateTasks(jio, state) {
    return jio.allDocs({
      query:  {
        type: 'complex',
        operator: 'AND',
        query_list: [
          {
            type: 'simple',
            key: 'type',
            value: 'Task'
          }, {
            type: 'simple',
            key: 'state',
            operator: '=',
            value: state
          }
        ]
      }
    }).then(function (response) {
      return RSVP.resolve(response.data.total_rows);
    });
  }


  /**
   * Count the tasks within a project.
   *
   * @param {Object} jio the storage instance to use
   * @param {String} project name of the project to look up
   * @return {Promise} A promise that resolved to the
   * number of tasks in the project.
   */
  function countProjectTasks(jio, project) {
    return jio.allDocs({
      query:  {
        type: 'complex',
        operator: 'AND',
        query_list: [
          {
            type: 'simple',
            key: 'type',
            value: 'Task'
          }, {
            type: 'simple',
            key: 'project',
            operator: '=',
            value: project
          }
        ]
      }
    }).then(function (response) {
      return RSVP.resolve(response.data.total_rows);
    });
  }


  /**
   * Check if a state already exists.
   *
   * @param {Object} jio the storage instance to use
   * @param {String} state name of the state to look up
   * @return {Promise} A promise that resolved to true
   * if the state exists, false otherwise.
   */
  function checkStateExists(jio, state) {
    return jio.allDocs({
      query:  {
        type: 'complex',
        operator: 'AND',
        query_list: [
          {
            type: 'simple',
            key: 'type',
            value: 'State'
          }, {
            type: 'simple',
            key: 'state',
            operator: '=',
            value: state
          }
        ]
      }
    }).then(function (response) {
      return RSVP.resolve(response.data.total_rows >= 1);
    });
  }


  /**
   * Attempt to parse a string to a (possibly partial) date.
   * The returned object can be directly fed to a query if
   * the right key_schema has been provided.
   *
   * @param {String} s The string to be parsed
   * @return {Object} a JIODate instance if possible, or null
   */
  function parseJIODate(s) {
    try {
      return jiodate.JIODate(s);
    } catch (e) {
      return null;
    }
  }


  /**
   * Create a query string from the input text, if the
   * text already complies to the complex_queries grammar.
   * Basically adds a filter for the task type.
   * XXX nice to have: check grammar
   *
   * @param {Object} input_text a grammar-complying query string
   * @return {String} A query string that can be used with allDocs
   */
  function grammarQuery(search_string) {
    var query = '(type: "Task")';
    if (search_string) {
      query += ' AND ' + search_string;
    }
    return query;
  }


  /**
   * Create a query tree from the input text,
   * comparing with multiple properties and the start-stop date range.
   *
   * @param {Object} input_text a search term to be compared
   * @return {String} A query tree that can be used with allDocs
   */
  function smartQuery(search_string) {
    var wildcard_search_string = search_string ? ('%' + search_string + '%') : '%',
      query = null,
      search_date = parseJIODate(search_string),
      content_query_list = [
        {
          type: 'simple',
          key: 'title',
          value: wildcard_search_string
        }, {
          type: 'simple',
          key: 'description',
          value: wildcard_search_string
        }, {
          type: 'simple',
          key: 'translated_state',
          value: search_string
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

    return query;
  }


  /**
   * Display (or refresh) a list of tasks in the current page,
   * performing a search if there is search input.
   * Translation is applied after rendering the template.
   *
   * @param {Object} jio The storage instance
   * @param {String} sort_by name of the metadata property to sort on
   */
  function updateTaskList(jio, sort_by) {
    var search_string = getSearchString(),
      sort_on = [[sort_by || 'start', 'ascending']],
      query_function = search_string.charAt(0) === '(' ? grammarQuery : smartQuery,
      options = {
        include_docs: true,
        wildcard_character: '%',
        sort_on: sort_on,
        query: query_function(search_string)
      };

    Logger.debug('Querying tasks with: "%s" (%o)...', search_string, options.query);
    return docQuery(jio, options).
      then(function (tasks) {
        Logger.debug('%i tasks found', tasks.length);
        var template = Handlebars.compile($('#task-list-template').text());
        $('#task-list-container').
          html(template({tasks: tasks})).
          trigger('create');
        applyTranslation();
      });
  }


  /**
   * Update the settings form to edit project/state list.
   */
  function updateSettingsForm(jio) {
    var project_opt = {include_docs: true, sort_on: [['project', 'ascending']], query: '(type:"Project")'},
      project_promise = docQuery(jio, project_opt),
      state_opt = {include_docs: true, sort_on: [['state', 'ascending']], query: '(type:"State")'},
      state_promise = docQuery(jio, state_opt);

    return RSVP.all([project_promise, state_promise]).
      then(function (response_list) {
        var project_list = response_list[0],
          state_list = response_list[1];

        var template = Handlebars.compile($('#settings-form-template').text());
        $('#settings-form-container').
          html(template({
            project_list: project_list,
            state_list: state_list
          })).
          trigger('create');
        applyTranslation();

        // select the current language on the menu
        jqmSetSelected('#translate', i18n.lng());
      });
  }


  /**
   * Retrieve all the storage metadata and configuration attachments.
   *
   * @param {Object} jio_config The configuration storage
   * @return {Promise} A Promise which resolves to a list
   * of objects {doc: {...}, config: {...}}
   */
  function storageConfigList(jio_config) {
    return jio_config.allDocs({include_docs: true}).
      then(function (alldocs) {
        var attachment_promise_list = alldocs.data.rows.map(function (row) {
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
        return RSVP.all(attachment_promise_list);
      });
  }


  /**
   * Retrieve a single storage's configuration,
   * or provide the default value for a configuration object.
   *
   * @param {Object} jio_config The configuration storage
   * @param {String} id The id of the configuration to retrieve (may be null)
   * @return {Promise} A Promise which resolves to the configuration object.
   */
  function storageConfig(jio_config, id) {
    if (!id) {
      return RSVP.resolve({
        storage_type: 'local'
      });
    }

    return jio_config.get({_id: id}).
      then(function (response) {
        return jio_config.
          getAttachment({_id: response.id, _attachment: 'config'}).
          then(function (response) {
            return jIO.util.readBlobAsText(response.data);
          }).
          then(function (ev) {
            return JSON.parse(ev.target.result);
          });
      });
  }


  /**
   * If the browser supports the Application Cache, check
   * if an update is available and propose a page reload to the user.
   */
  function checkCacheUpdate() {
    var ac = window.applicationCache;
    if (!ac) {
      return;
    }
    ac.addEventListener('updateready', function () {
      if (ac.status === ac.UPDATEREADY) {
        ac.swapCache();
        if (window.confirm('An update is available. Reload now?')) {
          window.location.reload();
        }
      }
    }, false);
  }


  /**
   * Parse a fragment identifier with parameters.
   *
   * @param {String} hash The fragment string, like '#foo?bar=baz
   * @return {Object} A mapping of the parsed parameters, like {bar: 'baz'}
   */
  function parseHashParams(hash) {
    var pos = hash.indexOf('?'),
      s = pos > -1 ? hash.substr(pos + 1) : '',
      p = s ? s.split(/\&/) : [],
      l = 0,
      key_value,
      params = {};
    for (l = 0; l < p.length; l += 1) {
      key_value = p[l].split(/\=/);
      params[key_value[0]] = decodeURIComponent(key_value[1] || '') || true;
    }
    return params;
  }


  /**
   * If the current page has a .footer-container element,
   * update it and set the current tab.
   */
  function updateFooter() {
    var $page = $.mobile.activePage,
      page_id = $page.attr('id'),
      $footer_container = $page.find('.footer-container');

    if ($footer_container.length === 0) {
      return;
    }

    var template = Handlebars.compile($('#footer-template').text()),
      // We can't inspect the page to see if there's an iframe, since
      // the form is generated with a template and is not on the DOM yet.
      // Therefore we hardcode the id of the page and directly check it.
      toggle_fullscreen = USE_FULLSCREEN_WIDGET && ($.mobile.activePage.attr('id') === 'task-detail-page');

    $footer_container.
      html(template({
        page_id: page_id,
        toggle_fullscreen: toggle_fullscreen
      })).
      trigger('create');

    // activate the tab related to the current page (if any)
    $footer_container.find('a[href=#' + page_id + ']').addClass('ui-btn-active');

    applyTranslation();
  }



  /***********************************
   *                                 *
   * Handlebars helpers registration *
   *                                 *
   ***********************************/

  /**
   * Clean up HTML before display for security reasons
   * (see https://github.com/gbirke/Sanitize.js)
   * Also, truncates the resulting string if it's too long.
   * This may leave bad formatting in 'relaxed' mode,
   * but we are using the strictest mode, which only
   * preserves the text content.
   *
   * @param {String} html The insecure string to sanitize.
   * @param {String} maxsize The length to trim the string at.
   * @return {String} The safe (will not be escaped) string to render in HTML.
   */
  Handlebars.registerHelper('sanitize', function (html, maxsize) {
    // The Sanitize module only works on DOM nodes, so we create one from the string...
    var node = $('<div>' + html + '</div>'),
      s = new Sanitize(),
      clean_fragment = s.clean_node(node[0]),
      // ...take the resulting fragment...
      tmpdiv = document.createElement('div'),
      text = '';

    // ...and wrap the fragment around a node...
    tmpdiv.appendChild(clean_fragment);
    // ...only to access its innerHTML property.
    // It would be simpler if Sanitize took a string.

    text = tmpdiv.innerHTML;

    if (maxsize && text.length > maxsize) {
      // truncate string to word boundary
      text = text.substr(0, maxsize - 1);
      if (text.indexOf(' ') !== -1) {
        // single huge word, cut it
        text = text.substr(0, text.lastIndexOf(' '));
      }
      text = text + '&hellip;';
    }

    return new Handlebars.SafeString(text);
  });


  /**
   * Display date strings or objects as yyyy-mm-dd - see https://xkcd.com/1179/
   * (takes timezone into account)
   *
   * @param {String} date The date string (or Date object) to display.
   * @return {String} The safe (will not be escaped) string to render in HTML.
   * Escaped or not, it doesn't make a real difference here.
   */
  Handlebars.registerHelper('asYMD', function (date) {
    if (date) {
      return new Handlebars.SafeString(moment(date).format('YYYY-MM-DD'));
    }
    return '';
  });


  /**
   * Make translations accessible from within Handlebars templates
   */
  Handlebars.registerHelper('t', function (i18n_key) {
    return new Handlebars.SafeString(i18n.t(i18n_key));
  });


  /**
   * Add value comparisions, see also
   * http://github.com/assemble/handlebars-helpers/blob/master/lib/helpers/helpers-comparisons.js
   * The operator must be quoted:
   *
   * {{#ifCond v1 '===' v2}}
   * ...
   * {{/ifCond}}
   */
  Handlebars.registerHelper('ifCond', function (v1, operator, v2, options) {
    switch (operator) {
    case '!==':
      return (v1 !== v2) ? options.fn(this) : options.inverse(this);
    case '===':
      return (v1 === v2) ? options.fn(this) : options.inverse(this);
    case '<':
      return (v1 < v2) ? options.fn(this) : options.inverse(this);
    case '<=':
      return (v1 <= v2) ? options.fn(this) : options.inverse(this);
    case '>':
      return (v1 > v2) ? options.fn(this) : options.inverse(this);
    case '>=':
      return (v1 >= v2) ? options.fn(this) : options.inverse(this);
    default:
      return options.inverse(this);
    }
  });




  /********************************
   *                              *
   * UI event handlers start here *
   *                              *
   ********************************/

  /**
   * Apply a language change upon selection from the menu.
   * This will store the selected language in the 'i18next'
   * session cookie.
   */
  $(document).on('change', '#translate', function () {
    var current_language = $(this).val();
    $.i18n.setLng(current_language, applyTranslation);
  });


  $(document).on('pageshow', function () {
    var $page = $.mobile.activePage;

    // Restore the url of the page we're showing.
    // This hack is needed to support hash parameters until JQM v1.5.
    // For more information, see
    // https://github.com/jquery/jquery-mobile/issues/2859
    // https://github.com/jquery/jquery-mobile/issues/6965
    $page.jqmData('url', '#' + $page.attr('id'));

    // Update the navigation footer
    updateFooter();
  });


  $(document).on('pagebeforeshow', '#settings-page', function () {
    jioConnect().then(function (jio) {
      Logger.debug('Loading Settings page');
      updateSettingsForm(jio);
    }).fail(displayError);
  });


  /**
   * Remove test data, must reload the page to create it again.
   */
  $(document).on('click', '#btn-reset-data', function () {
    jioConfigConnect().then(function (jio_config) {
      return jioConnect().
        then(function (jio) {
          Logger.info('Clearing tasks storage.');
          deleteStorageContent(jio);
        }).
        then(function () {
          Logger.info('Clearing configuration storage.');
          deleteStorageContent(jio_config);
        }).
        then(function () {
          Logger.info('Set current storage to default.');
          setSelectedStorage(default_storage_id);
          // XXX notify user with dialog?
        });
    }).fail(displayError);
  });


  /**
   * Prepare the #project-list-page before displaying.
   * This queries the storage for a list of the projects and tasks,
   * then provides them as parameters to Handlebars.
   * Translation is applied after rendering the template.
   */
  $(document).on('pagebeforeshow', '#project-list-page', function () {
    Logger.debug('Loading Projects page');
    jioConnect().then(function (jio) {
      var options = {
        include_docs: true,
        query: '(type:"Project") OR (type:"Task")',
        sort_on: [['project', 'ascending']]
      }, task_map = {};

      Logger.debug('Querying projects...');
      return docQuery(jio, options).
        then(function (docs) {
          var i = 0;

          // Handlebars has very limited support for traversing data,
          // so we have to group/count everything in advance.

          for (i = 0; i < docs.length; i += 1) {
            if (docs[i].type === 'Project') {
              task_map[docs[i].project] = {tasks: [], task_count: 0};
            }
          }

          for (i = 0; i < docs.length; i += 1) {
            if (docs[i].type === 'Task') {
              task_map[docs[i].project] = task_map[docs[i].project] || {tasks: [], task_count: 0};
              task_map[docs[i].project].tasks.push(docs[i]);
              task_map[docs[i].project].task_count += 1;
            }
          }

          var template = Handlebars.compile($('#project-list-template').text());
          $('#project-list-container').
            html(template({task_map: task_map})).
            trigger('create'); // notify jqm of the changes we made
          applyTranslation();
        });
    }).fail(displayError);
  });


  /**
   * Apply a sort order change to the task list, upon selection from the menu.
   */
  $(document).on('change', '#task-sortby', function () {
    var sort_by = $(this).val();
    jioConnect().then(function (jio) {
      return updateTaskList(jio, sort_by);
    }).fail(displayError);
  });


  /**
   * Initial rendering of the 'task list' page.
   */
  $(document).on('pagebeforeshow', '#task-list-page', function () {
    Logger.debug('Loading Task List Page');
    jioConnect().then(function (jio) {
      // attempt to fix cosmetic issue with a select menu in the header
      $('#task-sortby-button').addClass('ui-btn-left');
      return updateTaskList(jio);
    }).fail(displayError);
  });


  var _input_timer = null;

  /**
   * Perform a search and update the task list.
   * A timer is used to avoid querying for each character.
   */
  $(document).on('input', '#search-tasks', function () {
    var search_string = getSearchString();

    // Grammar vs Smart queries will be discriminated by parentheses.
    // To avoid flooding the server, a beginning parens requires an
    // ending parens. Also, all queries are delayed by 500 ms in case
    // of further input.

    if (search_string.charAt(0) === '(' &&
        search_string.charAt(search_string.length - 1) !== ')') {
      return;
    }

    jioConnect().then(function (jio) {
      if (_input_timer) {
        window.clearTimeout(_input_timer);
        _input_timer = null;
      }
      _input_timer = window.setTimeout(function () {
        updateTaskList(jio); // XXX errors from this promise are not propagated
                             // and would have to be handled separately.
        _input_timer = 0;
      }, 500);
    }).fail(displayError);
  });


  /**
   * Redirects to the details page for a task, when a task is
   * clicked in the list.
   * Since we cannot use query parameters (they would not work
   * with the appcache) we temporarily change the url of
   * the target page. It will be restored during the pageshow event.
   */
  $(document).on('click', '.task-detail-link', function () {
    $('#task-detail-page').jqmData('url', this.hash);
    $.mobile.changePage('#task-detail-page');
  });


  /**
   * Display the form to edit a single task's details,
   * or to create a new task.
   * Translation is applied after rendering the template.
   */
  $(document).on('pagebeforeshow', '#task-detail-page', function () {
    var task_id = parseHashParams(window.location.hash).task_id;
    jioConnect().then(function (jio) {
      Logger.debug('Loading Task Edit page');
      var project_opt = {include_docs: true, sort_on: [['project', 'ascending']], query: '(type:"Project")'},
        project_promise = docQuery(jio, project_opt),
        task_promise = null,
        state_opt = {include_docs: true, sort_on: [['state', 'ascending']], query: '(type:"State")'},
        state_promise = docQuery(jio, state_opt),
        dateinput_type = hasHTML5DatePicker() ? 'date' : 'text';

      if (task_id) {
        task_promise = jio.get({_id: task_id});
        Logger.debug('Retrieving task %s', task_id);
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

      return RSVP.all([task_promise, project_promise, state_promise]).
        then(function (response_list) {
          var task_resp = response_list[0],
            project_list = response_list[1],
            state_list = response_list[2];

          var template = Handlebars.compile($('#task-detail-template').text());
          $('#task-detail-container').
            html(template({
              task: task_resp.data,
              project_list: project_list,
              state_list: state_list,
              dateinput_type: dateinput_type
            })).
            trigger('create');
          jqmSetSelected('#task-project', task_resp.data.project);
          jqmSetSelected('#task-state', task_resp.data.state);
          // XXX if the project does not exist anymore, the first one is selected
          applyTranslation();
        });
    }).fail(displayError);
  });


  /**
   * Fullscreen toggle for complex widgets
   */
  $(document).on('click', '.fullscreen-toggle a', function () {
    $('#task-description iframe').toggleClass('fullscreen');
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

      return update_prom.
        then(function (response) {
          Logger.debug('Updated task %o:', response.id);
          Logger.debug('  status %s (%s)', response.status, response.statusText);
          parent.history.back();
        });
    }).fail(displayError);
  });


  /**
   * Delete the currently open task from the storage.
   */
  $(document).on('click', '#task-delete', function () {
    jioConnect().then(function (jio) {
      var id = $('#task-id').val();

      return jio.remove({_id: id}).
        then(function (response) {
          Logger.debug('Deleted task %o:', response.id);
          Logger.debug('  status %s', response.status);
          parent.history.back();
          // XXX explicit redirect
        });
    }).fail(displayError);
  });


  /**
   * Display the form to switch between storages
   */
  $(document).on('pagebeforeshow', '#storage-list-page', function () {
    jioConfigConnect().then(function (jio_config) {
      Logger.debug('Loading Storage page');
      return storageConfigList(jio_config).
        then(function (storage_config_list) {
          var template = Handlebars.compile($('#storage-form-template').text());

          $('#storage-form-container').
            html(template({storage_config_list: storage_config_list})).
            trigger('create');
          applyTranslation();

          // initialize the radio button with the previously selected, or default, value
          $('#storage-form input:radio[name=storage][value=' + getSelectedStorage() + ']').
            prop('checked', true).
            checkboxradio('refresh');
        });
    }).fail(displayError);
  });


  /**
   * When a storage is selected, force the next jioConnect() call
   * to use its configuration.
   */
  $(document).on('change', 'input:radio[name=storage]', function () {
    setSelectedStorage($(this).val());
    _jio = null;
    _jio_promise = null;
    Logger.debug('Switching storage to', getSelectedStorage());
  });


  /**
   * Redirects to the details page for the selected storage.
   * Since we cannot pass the task id argument as a query
   * parameter (does not work with the appcache) we store it
   * in a closure variable.
   */
  $(document).on('click', '#storage-edit', function () {
    var storage_id = $('#storage-form input:radio[name=storage]:checked').val();
    $('#storage-detail-page').jqmData('url', '#storage-detail-page?storage_id=' + storage_id);
    $.mobile.changePage('#storage-detail-page');
  });


  /**
   * Display the form to edit a single storage's details,
   * or to create a new storage.
   * Translation is applied after rendering the template.
   */
  $(document).on('pagebeforeshow', '#storage-detail-page', function () {
    var storage_id = parseHashParams(window.location.hash).storage_id;
    jioConfigConnect().then(function (jio_config) {
      Logger.debug('Loading Storage Edit page:', storage_id);

      return storageConfig(jio_config, storage_id).
        then(function (config) {
          var template = Handlebars.compile($('#storage-detail-template').text());
          $('#storage-detail-container').
            html(template({
              id: storage_id,
              config: config,
              default_storage_id: default_storage_id
            })).
            trigger('create');
          applyTranslation();
        });
    }).fail(displayError);
  });


  /**
   * Apply changes to the edited storage configuration,
   * or create a new one.
   */
  $(document).on('click', '#storage-save', function () {
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

      return update_prom.
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
          $.mobile.changePage('#storage-list-page');
        });
    }).fail(displayError);
  });


  /**
   * Delete the currently open storage configuration.
   * Does not actually touch the storage's content, and resets
   * the selected storage to the default one.
   */
  $(document).on('click', '#storage-delete', function () {
    jioConfigConnect().then(function (jio_config) {
      var id = $('#storage-id').val();

      return jio_config.remove({_id: id}).
        then(function (response) {
          Logger.debug('Deleted storage %o:', response.id);
          Logger.debug('  status %s', response.status);
          setSelectedStorage(default_storage_id);
          $.mobile.changePage('#storage-list-page');
        });
    }).fail(displayError);
  });


  $(document).on('pagebeforeshow', '#storage-export-page', function () {
    var $export_container = $('#storage-export-json-container').empty();

    jioConnect().then(function (jio) {
      return jio.allDocs({include_docs: true});
    }).then(function (response) {
      var $textarea = $('<textarea id="#storage-export-json">'),
        json = JSON.stringify(response.data, null, 2);

      $export_container.
        append('<h3>Storage data</h3>').
        append($textarea);

      $textarea.
        // Set the height overriding the value set by JQM
        attr('rows', 6).
        css('height', 'inherit').
        val(json);

      var URL = window.webkitURL || window.URL,
        $link = $('<a data-role="button">'),
        blob = null;

      try {
        // http://caniuse.com/#search=blob
        blob = new Blob([json], {type: 'application/json'});
        $link.
          attr('href', URL.createObjectURL(blob)).
          attr('download', 'storage.json');
      } catch (e) {
        // fallback, with size limits
        $link.attr('href', 'data:text/octet-stream;base64,' + window.btoa(json));
      }

      $link.text('Download');

      $export_container.
        append($link).
        trigger('create');

    }).fail(function (e) {
      $export_container.
        append('<h3>Could not export storage</h3>');
      displayError(e);
    });
  });


  /**
   * Delete a state. It must have no tasks.
   */
  $(document).on('click', '#settings-del-state', function () {
    jioConnect().then(function (jio) {
      var $selected = $('input:radio:checked[name=state-radio]'),
        state = $selected.data('jio-state'),
        state_id = $selected.data('jio-id');

      return countStateTasks(jio, state).
        then(function (task_count) {
          if (task_count) {
            return RSVP.reject({
              statusText: 'Cannot remove state',
              message: task_count + ' tasks are in state "' + state + '"'
            });
          }
          return jio.remove({_id: state_id});
        }).then(function () {
          Logger.debug('State %s has been removed', state);
          updateSettingsForm(jio);
        });

    }).fail(displayError);
  });


  /**
   * Create a new state. Its name must be unique.
   */
  $(document).on('click', '#settings-add-state', function () {
    jioConnect().then(function (jio) {
      var state = window.prompt('State name?') || '';

      state = state.trim();

      if (!state) {
        return;
      }

      state = state.charAt(0).toUpperCase() + state.slice(1);

      return checkStateExists(jio, state).
        then(function (state_exists) {
          var doc = {
            'type': 'State',
            'state': state,
            'modified': new Date()
          };

          if (state_exists) {
            return RSVP.reject({
              statusText: 'Cannot add state',
              message: 'State "' + state + '" already exists'
            });
          }

          return jio.post(doc).
            then(function (response) {
              Logger.debug('Added state: %o', response.id);
              Logger.debug('  status %s (%s)', response.status, response.statusText);
              updateSettingsForm(jio);
            });
        });
    }).fail(displayError);
  });


  /**
   * Delete a project. It must have no tasks.
   */
  $(document).on('click', '#settings-del-project', function () {
    jioConnect().then(function (jio) {
      var $selected = $('input:radio:checked[name=project-radio]'),
        project = $selected.data('jio-project'),
        project_id = $selected.data('jio-id');

      return countProjectTasks(jio, project).
        then(function (task_count) {
          if (task_count) {
            return RSVP.reject({
              statusText: 'Cannot remove project "' + project + '"',
              message: 'The project contains ' + task_count + ' tasks.'
            });
          }
          return jio.remove({_id: project_id});
        }).then(function () {
          Logger.debug('Project %s has been removed', project);
          updateSettingsForm(jio);
        });

    }).fail(displayError);
  });


  /**
   * Create a new project. Its name must be unique.
   */
  $(document).on('click', '#settings-add-project', function () {
    jioConnect().then(function (jio) {
      var project = window.prompt('Project name?') || '';

      project = project.trim();

      if (!project) {
        return;
      }

      project = project.charAt(0).toUpperCase() + project.slice(1);

      return checkProjectExists(jio, project).
        then(function (project_exists) {
          var doc = {
            'type': 'Project',
            'project': project,
            'modified': new Date()
          };

          if (project_exists) {
            return RSVP.reject({
              statusText: 'Cannot add project',
              message: 'Project "' + project + '" already exists'
            });
          }

          return jio.post(doc).
            then(function (response) {
              Logger.debug('Added project: %o', response.id);
              Logger.debug('  status %s (%s)', response.status, response.statusText);
              updateSettingsForm(jio);
            });
        });
    }).fail(displayError);
  });



  /***************************
   *                         *
   * Application starts here *
   *                         *
   ***************************/


  if (!getSelectedStorage()) {
    setSelectedStorage(default_storage_id);
  }

  // avoid FOUC (http://en.wikipedia.org/wiki/Flash_of_unstyled_content)
  $('.initHandler').removeClass('initHandler');

  $.mobile.selectmenu.prototype.options.nativeMenu = false;
  $.mobile.defaultPageTransition = 'none';

  if (!hasHTML5DatePicker()) {
    $.datepicker.setDefaults({dateFormat: 'yy-mm-dd'});
  }

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
  }, applyTranslation);

  checkCacheUpdate();

});

