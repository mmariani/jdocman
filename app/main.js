/*jslint indent: 2, nomen: true, vars: true, browser: true */
/*global $, Logger, RSVP, dav_storage, Handlebars, jiodate, moment, i18n, jIO, Blob, Sanitize, renderJS */

$(document).on('mobileinit', function () {
  "use strict";

  var APPLICATION_MODE = 'editor',
    DEBUG = true;


  // Set up logging, as soon as possible, to console
  Logger.useDefaults();

  Logger.setLevel(DEBUG ? Logger.DEBUG : Logger.WARN);


  //
  // A small namespace for very generic functions.
  //
  var util = (function () {
    var my = {},
      fold_map = [
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

    /**
     * Creates a function to use for (case insensitive) accent folding.
     *
     * @param {String} map An array of (regexp, string) to do the conversion.
     * @return {Function} The folding function.
     */
    function AccentFolder(map) {
      return function (s) {
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

    my.accentFoldLC = new AccentFolder(fold_map);


    /**
     * Parse a fragment identifier with parameters.
     *
     * @param {String} hash The fragment string, like '#foo?bar=baz
     * @return {Object} A mapping of the parsed parameters, like {bar: 'baz'}
     */
    my.parseHashParams = function (hash) {
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
    };


    /**
     * Create a fragment identifier with parameters.
     *
     * @param {String} fragment The fragment part without parameters
     * @param {Object} params A mapping of the parameters, like {bar: 'baz'}
     * @return {String} The full fragment string, like '#foo?bar=baz
     */
    my.encodeHashParams = function (fragment, params) {
      var parts = [], key = null;
      params = params || {};
      for (key in params) {
        if (params.hasOwnProperty(key)) {
          parts.push(key + '=' + encodeURIComponent(params[key]));
        }
      }
      return parts.length ? (fragment + '?' + parts.join('&')) : fragment;
    };


    /**
     * If the browser supports the Application Cache, check
     * if an update is available and propose a page reload to the user.
     */
    my.checkCacheUpdate = function () {
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
    };


    /**
     * Detect if the browser has native support for <input type="date">
     *
     * @return {Boolean} True if the browser has a datepicker, false otherwise.
     */
    my.hasHTML5DatePicker = function () {
      var el = document.createElement('input');
      el.setAttribute('type', 'date');
      return el.type !== 'text';
    };

    return my;
  }());



  /**
   * Provide a configuration object for the application.
   *
   * @param {String} application_mode One of 'taskman', 'editor', 'svg' etc.
   * @return {Object} An object with the following properties.
   * jio_type: the type of jIO document (chosen in relation to ERP5).
   * has_attachment: whether the application must handle attachments
   *                 through officejs at all (true), or keep everything in the metadata (false).
   * attachment_content_type: the Mime Type used to serve attachments, charset is specified as well
   *                          to avoid encoding mismatches.
   * i18n_namespace: the basename of the file to use in addition to app/i18n/__lng__/generic.json.
   *                 See the call to $.i18n.init()
   * test_data_url: the file which contains test data in JSON format.
   *                It can be used through Settings / Import / "insert test data"
   * jqm_theme: the default data-theme for the UI.
   * gadget.url: URL of the OfficeJS gadget used to edit the attachments.
   * gadget.beforeLoad: if present, a function that will be called before rendering the gadget.
   */
  function getApplicationConfig(application_mode) {
    switch (application_mode) {
    case 'taskman':
      return {
        jio_type: 'Task',
        has_attachment: false,
        i18n_namespace: 'taskman',
        test_data_url: 'app/data/test_data_taskman.json'
      };
    case 'editor':
      return {
        jio_type: 'Web Page',
        has_attachment: true,
        attachment_content_type: 'text/html; charset=utf8',
        i18n_namespace: 'editor',
        test_data_url: 'app/data/test_data_editor.json',
        jqm_theme: 'a',
        gadget: {
          url: 'lib/officejs/gadget/bootstrap-wysiwyg.html'
        }
      };
    case 'spreadsheet':
      return {
        jio_type: 'Web Table',
        has_attachment: true,
        attachment_content_type: 'application/json',
        i18n_namespace: 'spreadsheet',
        test_data_url: 'app/data/test_data_spreadsheet.json',
        jqm_theme: 'a',
        gadget: {
          url: 'lib/officejs/gadget/jqs.html'
        }
      };
    case 'svg':
      return {
        jio_type: 'Image',
        has_attachment: true,
        attachment_content_type: 'image/svg+xml',
        i18n_namespace: 'svg',
        test_data_url: 'app/data/test_data_svg.json',
        jqm_theme: 'a',
        gadget: {
          url: 'lib/officejs/gadget/svgedit.html',
          beforeLoad: function () {
            // Discard the previous data, which is possibly unrelated to the current document.
            localStorage.removeItem('svgedit-default');
          }
        }
      };
    default:
      window.alert('Unsupported application mode: ' + application_mode);
    }
  }


  var appconfig = getApplicationConfig(APPLICATION_MODE),
    default_attachment_name = 'content',
    default_storage_id = 'default_storage',
    root_gadget = null,
    editor_gadget = null,
    _jio = null,
    _jio_promise = null,
    _jio_config = null,
    _jio_config_promise = null,
    template = {
      // precompile for speed
      'feedback-popup': Handlebars.compile($('#feedback-popup-template').text()),
      'document-list': Handlebars.compile($('#document-list-template').text()),
      'settings-form': Handlebars.compile($('#settings-form-template').text()),
      'footer': Handlebars.compile($('#footer-template').text()),
      'project-list': Handlebars.compile($('#project-list-template').text()),
      'metadata-form': Handlebars.compile($('#metadata-form-template').text()),
      'storage-config': Handlebars.compile($('#storage-config-template').text())
    },
    //
    // Define a schema of search keys for the document queries,
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
          return RSVP.resolve(util.accentFoldLC(translated_object_value) ===
                              util.accentFoldLC(value));
        }
      },
      key_set: {
        title: {
          read_from: 'title',
          cast_to: util.accentFoldLC
        },
        description: {
          read_from: 'description',
          cast_to: util.accentFoldLC
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



  /**********************************
   *                                *
   * Application specific functions *
   *                                *
   *********************************/

  /**
   * Retrieve the ID of the main storage
   * to use for metadata and attachments.
   *
   * @return {String} The id of the storage
   */
  function getSelectedStorage() {
    return localStorage.getItem('jio_selected_storage');
  }


  /**
   * Change the current storage
   *
   * @param {String} val The id of the storage to use
   */
  function setSelectedStorage(val) {
    Logger.debug('Switching storage to', val);
    // Force jioConnect to ask for a new instance.
    _jio = null;
    _jio_promise = null;
    localStorage.setItem('jio_selected_storage', val);
  }


  /**
   * Immediately apply translation to all elements
   * which have a data-i18n attribute.
   * The selector is not very efficient but is good enough
   * for a small application like this.
   */
  function applyTranslation() {
    $('[data-i18n]').i18n();
    // Set the title of the application, in case JQM changed it.
    document.title = i18n.t('application_name');
  }


  /**
   * Update a <select> element's selected option,
   * then activates the jquery mobile event to refresh UI
   *
   * @param {Object|String} element The selector or element object
   * @param {String} value The value to set
   */
  function jqmSetSelected(element, value) {
    var $select = $(element);

    $select.children().each(function (i, op) {
      /*jslint unparam: true*/
      if (op.getAttribute('value') === value) {
        op.setAttribute('selected', 'selected');
      }
    });

    $select.selectmenu('refresh');
  }


  /**
   * Update a checkboxradio's selected option,
   * then activates the jquery mobile event to refresh UI
   *
   * @param {Object|String} element The selector or element objects
   * @param {String} value The value to set
   */
  function jqmSetRadio(element, value) {
    var $radio = $(element);

    $radio.filter('[value=' + value + ']').prop('checked', true);
    $radio.checkboxradio('refresh');
  }


  /**
   * Change page and provide parameters within the fragment identifier.
   * Since we cannot use query parameters (they would not work
   * with the appcache) we temporarily change the url of
   * the target page. It will be restored during the pageshow event.
   *
   * @param {String} page The page id, including '#'
   * @param {Object|String} params The parameters to encode, or a fragment
   * identifier which is already encoded. Optional.
   * @param {Object} options The options to pass to changePage()
   */
  function gotoPage(page_selector, params, options) {
    // here '#' has double meaning: CSS selector and fragment separator
    var url = (typeof params === 'string') ? params : util.encodeHashParams(page_selector, params);
    $(page_selector).jqmData('url', url);
    $.mobile.changePage(page_selector, options);
  }


  /**
   * Retrieve the text typed by the user for searching.
   *
   * @return {String} The search string
   */
  function getSearchString() {
    return $('#search-documents').val().trim();
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
   * Display a message, within a JQM modal popup.
   */
  function displayFeedback(header, message) {
    var $container = $('#feedbackPopupContainer'),
      html = template['feedback-popup']({
        message: header,
        details: message,
        button_text: 'Ok'
      });

    if ($container.length === 0) {
      $container = $('<div id="feedbackPopupContainer">');
      $(document.body).append($container);
    }

    $container.html(html).trigger('create');
    $('#feedbackPopup').popup('open');
    $('#feedbackPopup').bind({
      popupafterclose: function () {
        $('#feedbackPopup').remove();
      }
    });
  }


  /**
   * Display an error's title and message, as received by jIO methods.
   * In case of exception, shows the stack trace.
   * This function can be used as a then parameter.
   *
   *     doSomething().then(...).fail(displayError);
   */
  function displayError(error) {
    var header = error.statusText || 'Application error',
      message = error.stack ? ('<pre>' + error.stack + ' </pre>') : error.message;

    displayFeedback(header, message);
  }


  /**
   * This function must be used as a then parameter if you don't want to manage
   * errors. It changes the promise to the fulfillment channel with no fulfillment
   * value.
   *
   *     doSomething().fail(ignoreError).then(...);
   */
  function ignoreError(e) {
    Logger.error('Error ignored:', e);
    // no error propagated here
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


  /**
   * Creates a storage description from to a configuration object.
   */
  function storageDescription(config) {
    if (config.storage_type === 'local') {
      return {
        type: 'local',
        username: config.username,
        application_name: config.storage_name
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

    if (config.storage_type === 'drupal') {
      return {
        username: config.username,
        password: config.password,
        server: config.server,
        endpoint: config.endpoint,
        privateserver: config.privateserver
      };
    }

    window.alert('unsupported storage type: ' + config.storage_type);
  }


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
      type: 'local',
      username: 'Admin',
      application_name: 'jiodocs-config'
    });

    // either load configuration from local storage, or create it

    var postSomeConfIfNecessary = function (alldocs_response) {
      if (alldocs_response.data.total_rows) {
        _jio_config = jio_config;
        return _jio_config;
      }
      Logger.debug('No configuration found, populating configuration storage');

      var post_promise_list = null,
        // first of the list is the default storage
        default_config_list = [
          {
            storage_type: 'local',
            username: 'Admin',
            storage_name: 'Local-1'
          }, {
            storage_type: 'dav',
            username: 'Admin',
            storage_name: 'WebDAV',
            url: 'http://localhost/',
            realm: '',
            auth_type: 'none',
            password: ''
          }, {
            storage_type: 'local',
            storage_name: 'Local-2',
            json_description: '{"type":"local","username":"Admin","application_name":"Local"}'
          }, {
            storage_type: 'drupal',
            storage_name: 'Drupal 7.x REST',
            json_description: '{"type":"drupal",
             "username":"*username*",
             "password":"*password*",
             "server": "*http://domain.com*",
             "privateserver": "true",
             "endpoint": "*drupal/api/endpoint*",
             "applicationname": "*example*"}'
          }];

      post_promise_list = default_config_list.map(function (config, i) {
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

      return RSVP.all(post_promise_list).
        then(function () {
          Logger.debug('Configuration created.');
          _jio_config = jio_config;
          return _jio_config;
        });
    };

    _jio_config_promise = jio_config.allDocs().
      then(postSomeConfIfNecessary).
      then(null, null, stopProgressPropagation);
    return _jio_config_promise;
  }


  /**
   * This function creates the global _jio instance bound to the
   * main storage.
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
        return jio_config.getAttachment({
          _id: getSelectedStorage(),
          _attachment: 'config'
        });
      }).
      then(function (response) {
        return jIO.util.readBlobAsText(response.data);
      }).
      then(function (ev) {
        return JSON.parse(ev.target.result);
      }).
      then(function (config) {
        Logger.debug('Using storage:', config.storage_name);
        var storage_description = config.json_description ? JSON.parse(config.json_description) : storageDescription(config);
        storage_description.key_schema = key_schema;
        _jio = jIO.createJIO(storage_description);
        return _jio;
      }).
      then(null, null, stopProgressPropagation);
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
        return del_promise_list.length;
      });
    });
  }


  /**
   * Check if a project already exists.
   *
   * @param {Object} jio The storage instance to use
   * @param {String} project_title Title of the project to look up
   * @return {Promise} A promise that resolves to true
   * if the project exists, false otherwise.
   */
  function checkProjectExists(jio, project_title) {
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
            key: 'title',
            operator: '=',
            value: project_title
          }
        ]
      }
    }).then(function (response) {
      return RSVP.resolve(response.data.total_rows >= 1);
    });
  }


  /**
   * Count the documents with a given state.
   *
   * @param {Object} jio The storage instance to use
   * @param {String} state_title Title of the state to look up
   * @return {Promise} A promise that resolves to the
   * number of documents with that state.
   */
  function countStateDocuments(jio, state_title) {
    return jio.allDocs({
      query:  {
        type: 'complex',
        operator: 'AND',
        query_list: [
          {
            type: 'simple',
            key: 'type',
            value: appconfig.jio_type
          }, {
            type: 'simple',
            key: 'state',
            operator: '=',
            value: state_title
          }
        ]
      }
    }).then(function (response) {
      return RSVP.resolve(response.data.total_rows);
    });
  }


  /**
   * Count the documents within a project.
   *
   * @param {Object} jio The storage instance to use
   * @param {String} project_title Title of the project to look up
   * @return {Promise} A promise that resolves to the
   * number of documents in the project.
   */
  function countProjectDocuments(jio, project_title) {
    return jio.allDocs({
      query:  {
        type: 'complex',
        operator: 'AND',
        query_list: [
          {
            type: 'simple',
            key: 'type',
            value: appconfig.jio_type
          }, {
            type: 'simple',
            key: 'project',
            operator: '=',
            value: project_title
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
   * @param {Object} jio The storage instance to use
   * @param {String} state_title Title of the state to look up
   * @return {Promise} A promise that resolves to true
   * if the state exists, false otherwise.
   */
  function checkStateExists(jio, state_title) {
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
            key: 'title',
            operator: '=',
            value: state_title
          }
        ]
      }
    }).then(function (response) {
      return RSVP.resolve(response.data.total_rows >= 1);
    });
  }


  /**
   * Create a query string from the input text, if the
   * text already complies to the jIO Query grammar.
   * Basically adds a filter for the document type.
   *
   * @param {Object} input_text A grammar-complying query string
   * @return {String} A query string that can be used with allDocs
   */
  function grammarQuery(search_string) {
    var query = '(type: "' + appconfig.jio_type + '")';
    if (search_string) {
      query += ' AND ' + search_string;
    }
    return query;
  }


  /**
   * Create a query tree from the input text,
   * comparing with multiple properties and the start-stop date range.
   *
   * @param {Object} input_text A search term to be compared
   * @return {String} A query tree that can be used with allDocs
   */
  function smartQuery(search_string) {
    var query = null,
      search_date = parseJIODate(search_string),
      content_query_list = [];

    if (search_string) {
      content_query_list.push({
        type: 'simple',
        key: 'title',
        value: '%' + search_string + '%'
      });
      content_query_list.push({
        type: 'simple',
        key: 'description',
        value: '%' + search_string + '%'
      });
      content_query_list.push({
        type: 'simple',
        key: 'translated_state',
        value: search_string
      });
    }

    if (search_date) {
      Logger.debug('Search for date:', search_date);

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
      type: 'simple',
      key: 'type',
      value: appconfig.jio_type
    };

    if (content_query_list.length) {
      query = {
        type: 'complex',
        operator: 'AND',
        query_list: [
          query,
          {
            type: 'complex',
            operator: 'OR',
            query_list: content_query_list
          }
        ]
      };
    }

    return query;
  }


  /**
   * Display (or refresh) a list of documents in the current page,
   * performing a search if there is search input.
   * Translation is applied after rendering the template.
   *
   * @param {Object} jio The storage instance
   * @param {String} sort_by name of the metadata property to sort on
   */
  function updateDocumentList(jio, sort_by) {
    var search_string = getSearchString(),
      sort_on = [[sort_by || 'start', 'ascending']],
      query_function = search_string.charAt(0) === '(' ? grammarQuery : smartQuery,
      options = {
        include_docs: true,
        sort_on: sort_on,
        query: query_function(search_string)
      };

    Logger.debug('Querying documents with: "%s" (%o)...', search_string, options.query);

    return jio.allDocs(options).
      then(function (response) {
        Logger.debug('%i documents found', response.data.total_rows);
        $('#document-list-container').
          html(template['document-list']({
            rows: response.data.rows
          })).
          trigger('create');
        applyTranslation();
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
                id: row.id,
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
   * Update the settings form to edit project/state list.
   */
  function updateSettingsForm() {
    var _storage_list = null,
      _error_message = null;

    return jioConfigConnect().
      then(storageConfigList).
      then(function (storage_list) {
        // same as _(storage_list).sortBy(function(o) {return o.config.storage_name})
        storage_list.sort(function (a, b) {
          var namea = a.config.storage_name,
            nameb = b.config.storage_name;
          return ((namea < nameb) ? -1 : ((namea > nameb) ? 1 : 0));
        });
        // store the configuration list in a closure var
        _storage_list = storage_list;
      }).
      then(jioConnect).
      then(function (jio) {
        var project_opt = {include_docs: true, sort_on: [['title', 'ascending']], query: '(type:"Project")'},
          state_opt = {include_docs: true, sort_on: [['title', 'ascending']], query: '(type:"State")'};

        if (jio) {
          return RSVP.all([
            jio.allDocs(project_opt),
            jio.allDocs(state_opt),
          ]);
        }
      }).
      // keep going even if we could not retrieve the state/project lists
      fail(function (e) {
        _error_message = e.message; // enough for both jio messages and exceptions
      }).
      always(function (response_list) {
        var project_list = response_list ? response_list[0].data.rows : null,
          state_list = response_list ? response_list[1].data.rows : null;

        $('#settings-form-container').
          html(template['settings-form']({
            connection_ok: project_list !== null && state_list !== null,
            error_message: _error_message,
            storage_list: _storage_list,
            project_list: project_list,
            state_list: state_list
          })).
          trigger('create');

        jqmSetRadio('input:radio[name=language]', i18n.lng());
        jqmSetSelected('#storage-select', getSelectedStorage());
        applyTranslation();
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
  function storageConfig(jio_config, storage_id) {
    if (!storage_id) {
      return RSVP.resolve({
        storage_type: 'local'
      });
    }

    return jio_config.getAttachment({_id: storage_id, _attachment: 'config'}).
      then(function (response) {
        return jIO.util.readBlobAsText(response.data);
      }).
      then(function (ev) {
        return JSON.parse(ev.target.result);
      });
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

    $footer_container.
      html(template.footer()).
      trigger('create');

    // activate the tab related to the current page (if any)
    $footer_container.find('a[href=#' + page_id + ']').addClass('ui-btn-active');

    applyTranslation();
  }


  /**
   * Render the form for editing metadata.
   *
   * @param {String} document_id The id of the document to edit
   * @return {Promise} A promise which is fullfilled after rendering
   */
  function renderMetadata(document_id) {
    return jioConnect().then(function (jio) {
      var project_opt = {include_docs: true, sort_on: [['title', 'ascending']], query: '(type:"Project")'},
        project_promise = jio.allDocs(project_opt),
        metadata_promise = null,
        state_opt = {include_docs: true, sort_on: [['title', 'ascending']], query: '(type:"State")'},
        state_promise = jio.allDocs(state_opt),
        dateinput_type = util.hasHTML5DatePicker() ? 'date' : 'text';

      if (document_id) {
        metadata_promise = jio.get({_id: document_id});
      } else {
        metadata_promise = new RSVP.Promise(function (resolve) {
          resolve({
            data: {
              title: 'New Document',
              start: moment().format('YYYY-MM-DD')
            }
          });
        });
      }

      return RSVP.all([metadata_promise, project_promise, state_promise]).
        then(function (response_list) {
          var metadata_resp = response_list[0],
            project_list = response_list[1].data.rows,
            state_list = response_list[2].data.rows;

          $('#metadata-form-container').
            html(template['metadata-form']({
              metadata: metadata_resp.data,
              document_id: document_id,
              project_list: project_list,
              state_list: state_list,
              dateinput_type: dateinput_type
            })).
            trigger('create');

          jqmSetSelected($('#metadata-form-container [name=project]'), metadata_resp.data.project);
          jqmSetSelected($('#metadata-form-container [name=state]'), metadata_resp.data.state);
          applyTranslation();
        });
    });
  }


  /**
   * Save the current metadata form.
   *
   * @param {String} document_id The id of the document to save
   * @return {Promise} A promise which is fullfilled after saving
   */
  function saveMetadata(document_id) {
    return jioConnect().then(function (jio) {
      var $page = $.mobile.activePage,
        title = $page.find('[name=title]').val(),
        start = $page.find('[name=start]').val(),
        stop = $page.find('[name=stop]').val(),
        project = $page.find('[name=project]').val(),
        state = $page.find('[name=state]').val(),
        description = $page.find('[name=description]').val(),
        metadata = {},
        update_prom = null;

      // XXX validate input

      metadata = {
        type: appconfig.jio_type,
        title: title,
        start: start,
        stop: stop,
        project: project,
        state: state,
        description: description,
        modified: new Date()
      };

      if (document_id) {
        metadata._id = document_id;
        update_prom = jio.put(metadata);
      } else {
        update_prom = jio.post(metadata);
      }

      return update_prom.
        then(function (response) {
          Logger.debug('Updated document:', response.id);
          return RSVP.resolve(response.id);
        });
    });
  }


  /**
   * Retrieve the content of an attachment.
   *
   * @param {String} document_id The id of the parent document
   * @return {Promise} A promise which is fullfilled with
   * a string of the attachment's content.
   */
  function retrieveAttachmentContent(document_id) {
    return jioConnect().then(function (jio) {
      if (document_id) {
        return jio.getAttachment({
          _id: document_id,
          _attachment: default_attachment_name
        });
      }
    }).
      fail(function (response) {
        if (response.status === 404) {
          // attachment does not exist, no content to read
          return 404;
        }
        if (response.stack || response.status >= 400) {
          throw response;
        }
      }).
      then(function (response) {
        if (response === 404) {
          return null;
        }
        return jIO.util.readBlobAsText(response.data).
          then(function (ev) {
            return ev.target.result;
          });
      });
  }


  /**
   * Render the OfficeJS gadget for editing the attachment.
   *
   * @param {String} document_id The id of the parent document
   * @return {Promise} A promise which is fullfilled after rendering
   */
  function renderAttachment(document_id) {
    var content_prom = null;

    editor_gadget = null;

    if (appconfig.gadget && appconfig.gadget.beforeLoad) {
      appconfig.gadget.beforeLoad();
    }

    if (document_id) {
      content_prom = retrieveAttachmentContent(document_id);
    } else {
      content_prom = new RSVP.Promise(function (resolve) {
        resolve('');
      });
    }

    return content_prom.
      then(function (content) {
        return root_gadget.declareGadget(appconfig.gadget.url,
                                         { sandbox: 'iframe',
                                           element: document.getElementById('attachment-container')
                                         }).
          then(function (gadget) {
            editor_gadget = gadget;
            if (content) {
              return gadget.setContent(content);
            }
          });
      });
  }


  /**
   * Save the current attachment.
   *
   * @param {String} document_id The id of the parent document
   * @return {Promise} A promise which is fullfilled after saving
   */
  function saveAttachment(document_id) {
    return editor_gadget.getContent().
      then(function (attachment_content) {
        var attachment = {
          _id: document_id,
          _attachment: default_attachment_name,
          _data: new Blob([attachment_content],
                          { type: appconfig.attachment_content_type || 'application/octet-stream'})
        };
        return jioConnect().
          then(function (jio) {
            return jio.putAttachment(attachment);
          });
      });
  }


  /**
   * Show the metadata form, hide the attachment.
   */
  function showMetadata() {
    $('a#show-metadata').hide();
    $('a#show-attachment').show();
    $('#attachment-container').hide();
    $('#metadata-form-container').show();
  }


  /**
   * Show the metadata form, hide the attachment
   * and the toggle button as well.
   */
  function showMetadataOnly() {
    $('a#show-metadata').hide();
    $('a#show-attachment').hide();
    $('#attachment-container').hide();
    $('#metadata-form-container').show();
  }


  /**
   * Show the attachment editor, hide the metadata form.
   */
  function showAttachment() {
    $('a#show-attachment').hide();
    $('a#show-metadata').show();
    $('#metadata-form-container').hide();
    $('#attachment-container').show();
  }


  /**
   * Clear the containers of the metadata form and attachment editor
   */
  function clearMetadataAndAttachment() {
    $('#attachment-container').empty();
    $('#metadata-form-container').empty();
  }



  /***********************************
   *                                 *
   * Handlebars helpers registration *
   *                                 *
   ***********************************/

  Handlebars.registerPartial('document-link', $('#document-link-partial').text());

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
   * Display date strings or objects (takes timezone into account)
   * Use: {{formatDate foo format='YYYY-MM-DD'}}
   * The format parameter is optional, defaults to ISO - see https://xkcd.com/1179/
   *
   * @param {String} date The date string (or Date object) to display.
   * @param {String} block Named parameters.
   * @return {String} The safe (will not be escaped) string to render in HTML.
   * Escaped or not, it doesn't make a real difference here.
   */
  Handlebars.registerHelper('formatDate', function (date, block) {
    var format = block.hash.format || 'YYYY-MM-DD';
    if (date) {
      return new Handlebars.SafeString(moment(date).format(format));
    }
    return '';
  });


  /**
   * Make translations accessible from within Handlebars templates
   */
  Handlebars.registerHelper('t', function (i18n_key) {
    return i18n_key ? new Handlebars.SafeString(i18n.t(i18n_key)) : '';
  });


  /**
   * Wrapper for encodeURIComponent
   */
  Handlebars.registerHelper('encodeuc', function (text) {
    return window.encodeURIComponent(text);
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

  /**
   * Intercept the creation of the page, to make it possible
   * to use parameters in the fragment identifier.
   */
  $(document).on('pagecreate', function (ev) {
    if (window.location.hash.indexOf('?') > -1) {
      // we are loading from direct URL, page refresh, or a bookmark, and have parameters.
      $(ev.target).jqmData('url', window.location.hash);
    }
  });


  /**
   * Intercept every page change. If it's a "back" transition,
   * do nothing.
   * Otherwise, trigger the custom 'pagerender' event,
   * and pass the parsed parameters along with the event.
   */
  $(document).on('pagebeforechange', function (ev, data) {
    /*jslint unparam: true*/
    if (!data || typeof data.toPage === 'string') {
      return;
    }

    var args = util.parseHashParams($(data.toPage).jqmData('url'));

    if (data.options.reverse) {
      // we don't want to render the page again after hitting Back.
      // If required, it must be done inside pagebeforeshow.
      return;
    }

    $(data.toPage).trigger({
      type: 'pagerender',
      page: data.toPage,
      args: args
    });
  });


  /**
   * Apply a language change upon selection from the radio buttons.
   * This will store the selected language in the 'i18next'
   * session cookie.
   */
  $(document).on('change', 'input:radio[name=language]', function () {
    var current_language = $(this).val();
    $.i18n.setLng(current_language, applyTranslation);
  });


  $(document).on('pagerender', '#settings-page', function () {
    updateSettingsForm().
      fail(displayError);
  });


  /**
   * Prepare the #project-list-page before displaying.
   * This queries the storage for a list of the projects and documents,
   * then provides them as parameters to Handlebars.
   * Translation is applied after rendering the template.
   */
  $(document).on('pagebeforeshow', '#project-list-page', function () {
    jioConnect().then(function (jio) {
      var options = {
        include_docs: true,
        query: '(type:"Project") OR (type:"' + appconfig.jio_type + '")',
        sort_on: [['project', 'ascending']]
      }, document_map = {};

      return jio.allDocs(options).
        then(function (response) {
          var i = 0,
            rows = response.data.rows;

          // Handlebars has very limited support for traversing data,
          // so we have to group/count everything in advance.

          for (i = 0; i < rows.length; i += 1) {
            if (rows[i].doc.type === 'Project') {
              document_map[rows[i].doc.title] = {document_list: [], document_count: 0};
            }
          }

          for (i = 0; i < rows.length; i += 1) {
            if (rows[i].doc.type === appconfig.jio_type) {
              document_map[rows[i].doc.project] = document_map[rows[i].doc.project] || {document_list: [], document_count: 0};
              document_map[rows[i].doc.project].document_list.push(rows[i]);
              document_map[rows[i].doc.project].document_count += 1;
            }
          }

          $('#project-list-container').
            html(template['project-list']({
              project_count: rows.length,
              document_map: document_map
            })).
            trigger('create');
          applyTranslation();
        });
    }).fail(displayError);
  });


  /**
   * Apply a sort order change to the document list, upon selection from the menu.
   */
  $(document).on('change', '#document-sortby', function () {
    var sort_by = $(this).val();
    jioConnect().then(function (jio) {
      return updateDocumentList(jio, sort_by);
    }).fail(displayError);
  });


  /**
   * Initial rendering of the 'document list' page.
   */
  $(document).on('pagebeforeshow', '#document-list-page', function () {
    jioConnect().
      then(function (jio) {
        // attempt to fix cosmetic issue with a select menu in the header
        $('#document-sortby-button').addClass('ui-btn-left');
        return updateDocumentList(jio);
      }).
      then(function () {
        // manually update JQM rendering of the select menu
        // after having applied the translation
        $('#document-sortby').selectmenu('refresh');
      }).fail(displayError);
  });


  var _input_timer = null;

  /**
   * Perform a search and update the document list.
   * A timer is used to avoid querying for each character.
   */
  $(document).on('input', '#search-documents', function () {
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
        updateDocumentList(jio); // XXX errors from this promise are not propagated
                                 // and would have to be handled separately.
        _input_timer = 0;
      }, 500);
    }).fail(displayError);
  });


  /**
   * Redirects to the document page, when selected in the listview.
   */
  $(document).on('click', 'a.document-link', function (ev) {
    ev.preventDefault();
    gotoPage('#document-page', $(this).attr('href'));
  });


  $(document).on('click', 'a#show-metadata', function () {
    showMetadata();
  });


  $(document).on('click', 'a#show-attachment', function () {
    showAttachment();
  });


  /**
   * Display the form to edit a document's metadata details,
   * or to create a new document.
   * Translation is applied after rendering the template.
   */
  $(document).on('pagerender', '#document-page', function (ev) {
    var $page = $(ev.page),
      document_id = ev.args.document_id;

    if (document_id) {
      $page.find('.document-delete').show();
      if (appconfig.has_attachment) {
        showAttachment();
      } else {
        showMetadataOnly();
      }
    } else {
      $page.find('.document-delete').hide();
      if (appconfig.has_attachment) {
        showMetadata();
      } else {
        showMetadataOnly();
      }
    }

    return renderMetadata(document_id).
      then(function () {
        if (appconfig.has_attachment) {
          return renderAttachment(document_id);
        }
      }).fail(displayError);
  });


  $(document).on('click', 'a.new-document-link', function (ev) {
    ev.preventDefault();
    gotoPage('#document-page');
  });


  /**
   * Apply changes to the metadata, and go back to the attachment,
   * the document list or whatever page before the current one.
   */
  $(document).on('click', 'a#document-save', function (ev) {
    ev.preventDefault();
    var existing_document_id = util.parseHashParams(window.location.hash).document_id;
    saveMetadata(existing_document_id).
      then(function (document_id) {
        if (appconfig.has_attachment) {
          return saveAttachment(document_id);
        }
      }).
      then(function () {
        clearMetadataAndAttachment();
        parent.history.back();
      }).fail(displayError);
  });


  /**
   * Delete the currently open document from the storage.
   */
  $(document).on('click', 'a.document-delete', function (ev) {
    ev.preventDefault();
    var document_id = util.parseHashParams(window.location.hash).document_id;

    jioConnect().then(function do_remove(jio) {
      return jio.remove({_id: document_id});
    }).then(function do_back(response) {
      Logger.debug('Deleted document:', response.id);
      parent.history.back();
    }).fail(displayError);
  });


  $(document).on('click', '#document-page a[data-rel=back]', function () {
    clearMetadataAndAttachment();
  });


  /**
   * When a storage is selected, force the next jioConnect() call
   * to use its configuration.
   */
  $(document).on('change', '#storage-select', function () {
    setSelectedStorage($(this).val());
    updateSettingsForm().
      fail(displayError);
  });


  /**
   * Redirects to the details page for the selected storage.
   */
  $(document).on('click', 'a#storage-config', function (ev) {
    ev.preventDefault();
    var storage_id = $('#storage-select').val();
    gotoPage('#storage-config-page', {storage_id: storage_id});
  });


  /**
   * Display the form to edit a single storage's details,
   * or to create a new storage.
   * Translation is applied after rendering the template.
   */
  $(document).on('pagerender', '#storage-config-page', function (ev) {
    var storage_id = ev.args.storage_id;
    jioConfigConnect().then(function (jio_config) {
      return storageConfig(jio_config, storage_id).
        then(function (config) {
          $('#storage-config-container').
            html(template['storage-config']({
              id: storage_id,
              config: config,
              default_storage_id: default_storage_id
            })).
            trigger('create');
          applyTranslation();

          var $form = $('#storage-config-container form');
          jqmSetSelected($form.find('[name=storage_type]'), config.storage_type);
        });
    }).fail(displayError);
  });


  /**
   * Apply changes to the edited storage configuration,
   * or create a new one.
   */
  $(document).on('click', 'a#storage-save', function (ev) {
    ev.preventDefault();
    jioConfigConnect().then(function (jio_config) {
      var id = $('#storage-id').val(),
        $page = $.mobile.activePage,
        storage_type = $page.find('[name=storage_type]').val(),
        storage_name = $page.find('[name=storage_name]').val(),
        url = $page.find('[name=url]').val(),
        auth_type = $page.find('[name=auth_type]').val(),
        realm = $page.find('[name=realm]').val(),
        username = $page.find('[name=username]').val(),
        password = $page.find('[name=password]').val(),
        // something like
        // {"type":"local","username":"Admin","application_name":"Local"}
        json_description = $page.find('[name=json_description]').val(),
        config = null,
        metadata = null,
        update_prom = null;

      // XXX validate input

      config = {
        storage_type: storage_type,
        storage_name: storage_name,
        url: url,
        auth_type: auth_type,
        realm: realm,
        username: username,
        password: password,
        json_description: json_description
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
          setSelectedStorage(response.id);
          gotoPage('#settings-page');
        });
    }).fail(displayError);
  });


  /**
   * Delete the currently open storage configuration.
   * Does not actually touch the storage's content, and resets
   * the selected storage to the default one.
   */
  $(document).on('click', 'a#storage-delete', function (ev) {
    ev.preventDefault();
    var storage_id = $('#storage-id').val();

    jioConfigConnect().then(function do_remove(jio_config) {
      return jio_config.remove({_id: storage_id});
    }).then(function do_finalize(response) {
      Logger.debug('Deleted storage:', response.id);
      setSelectedStorage(default_storage_id);
      gotoPage('#settings-page');
    }).fail(displayError);
  });


  /**
   * Export the content of the current storage for backup purposes.
   */
  $(document).on('pagerender', '#storage-export-page', function () {
    var $export_container = $('#storage-export-json-container'),
      // collect evertything here as {'metadata': [...], 'attachment_list': [...]}
      archive = {},
      j = null; // jio connection

    // clear now, we might need to display an error
    $export_container.empty();

    jioConnect().then(function (jio) {
      j = jio;
      return j.allDocs({include_docs: true});
    }).then(function (response) {
      var attachment_promise_list = [];

      archive.metadata_list = response.data.rows;
      archive.attachment_list = [];

      archive.metadata_list.forEach(function (row) {
        var attachments = row.doc._attachments || {},
          attachment_name = '';
        for (attachment_name in attachments) {
          if (attachments.hasOwnProperty(attachment_name)) {
            archive.attachment_list.push({
              id: row.id,
              attachment_name: attachment_name
            });
            attachment_promise_list.push(
              j.getAttachment({
                _id: row.id,
                _attachment: attachment_name
              })
            );
          }
        }
      });
      return RSVP.all(attachment_promise_list);
    }).then(function (attachment_resp) {
      return RSVP.all(attachment_resp.map(function (response, idx) {
        archive.attachment_list[idx].content_type = response.data.type;
        return jIO.util.readBlobAsText(response.data);
      }));
    }).then(function (attachment_content_resp) {
      attachment_content_resp.forEach(function (ev, idx) {
        // encode in base64
        archive.attachment_list[idx].content = ev.target.result;
      });

      var $textarea = $('<textarea id="storage-export-json">'),
        json = JSON.stringify(archive, null, 2);

      $export_container.
        append('<h3>Storage data</h3>').
        append($textarea);

      $textarea.
        // Set the height overriding the value set by JQM
        attr('rows', 6).
        css('height', 'inherit').
        val(json);

      var URL = window.webkitURL || window.URL,
        $link = $('<a data-role="button">Download</a>'),
        blob = new Blob([json], {type: 'application/json'});

      $link.
        attr('href', URL.createObjectURL(blob)).
        attr('download', 'storage.json');

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
   * Page to import a previously exported content into the current storage.
   */
  $(document).on('pagerender', '#storage-import-page', function () {
    var $textarea = $('#storage-import-json');
    $textarea.
      // Set the height overriding the value set by JQM
      attr('rows', 6).
      css('height', 'inherit').
      val('');
  });


  /**
   * Insert test data into textarea
   */
  $(document).on('click', 'a#storage-import-test', function (ev) {
    ev.preventDefault();
    var $textarea = $('#storage-import-json');
    jIO.util.ajax({
      // XXX if 404, display the URL in dialog
      type: 'GET',
      url: appconfig.test_data_url
    }).then(function (ev) {
      $textarea.val(ev.target.responseText);
      displayFeedback('Storage import', 'Test data has been loaded. Click Import to insert it into the storage.');
    });
  });


  /**
   * Clear the content of the current storage.
   */
  $(document).on('click', 'a#storage-clear', function (ev) {
    ev.preventDefault();
    if (!window.confirm("Are you sure you want to remove the content of the storage?")) {
      return;
    }
    jioConnect().
      then(function (jio) {
        Logger.info('Clearing object storage.');
        return deleteStorageContent(jio);
      }).
      then(function (object_count) {
        displayFeedback('Storage cleanup', object_count + ' objects have been removed.');
      }).
      fail(displayError);
  });


  /**
   * Copy content from an uploaded file into the import textarea.
   */
  $(document).on('change', '#storage-import-upload', function () {
    var $input = $(this),
      file = $input[0].files[0];

    return jIO.util.readBlobAsText(file).
      then(function (ev) {
        var content = ev.target.result;
        JSON.parse(content);
        $('#storage-import-json').val(content);
      }).fail(function (e) {
        $input.val('');
        displayError({
          statusText: 'File upload error - ' + file.name,
          message: 'Cannot parse JSON data: ' + e.message
        });
      });
  });


  /**
   * Import a previously exported content into the current storage.
   */
  $(document).on('click', 'a#storage-import', function (ev) {
    ev.preventDefault();
    var object_count = 0;

    jioConnect().then(function (jio) {
      var text = $('#storage-import-json').val();

      if (!text.trim()) {
        displayError({
          statusText: 'Storage import error',
          message: 'Empty input'
        });
      }

      var archive = null;

      try {
        archive = JSON.parse(text);
      } catch (e) {
        displayError({
          statusText: 'Storage import error',
          message: 'Cannot parse JSON data: ' + e.message
        });
        return;
      }

      var ins_promise_list = [];

      archive.metadata_list.forEach(function (obj) {
        ins_promise_list.push(jio.put(obj.doc).
          then(function () {
            object_count += 1;
          }));
        // XXX collect and display list of errors?
      });

      archive.attachment_list.forEach(function (obj) {
        var content = obj.content,
          promise = jio.putAttachment({
            _id: obj.id,
            _attachment: obj.attachment_name,
            _data: new Blob([content], {type: obj.content_type})
          });
        ins_promise_list.push(promise.
          then(function () {
            object_count += 1;
          }));
      });

      return RSVP.all(ins_promise_list);
    }).then(function () {
      displayFeedback('Storage import', object_count + ' objects have been imported.');
    }).fail(displayError);
  });


  /**
   * Delete a state. It must have no related documents.
   */
  $(document).on('click', 'a#settings-del-state', function (ev) {
    ev.preventDefault();
    jioConnect().then(function (jio) {
      var $selected = $('input:radio:checked[name=state-radio]'),
        state_title = $selected.data('jio-state'),
        state_id = $selected.data('jio-id');

      return countStateDocuments(jio, state_title).
        then(function (document_count) {
          if (document_count) {
            return RSVP.reject({
              statusText: 'Cannot remove state',
              message: document_count + ' documents are in state "' + state_title + '"'
            });
          }
          return jio.remove({_id: state_id});
        }).then(function () {
          Logger.debug('State %s has been removed', state_title);
          return updateSettingsForm();
        });

    }).fail(displayError);
  });


  /**
   * Create a new state. Its name must be unique.
   */
  $(document).on('click', 'a#settings-add-state', function (ev) {
    ev.preventDefault();
    jioConnect().then(function (jio) {
      var state_title = window.prompt('State name?') || '';

      state_title = state_title.trim();

      if (!state_title) {
        return;
      }

      state_title = state_title.charAt(0).toUpperCase() + state_title.slice(1);

      return checkStateExists(jio, state_title).
        then(function (state_exists) {
          var doc = {
            type: 'State',
            title: state_title,
            modified: new Date()
          };

          if (state_exists) {
            return RSVP.reject({
              statusText: 'Cannot add state',
              message: 'State "' + state_title + '" already exists'
            });
          }

          return jio.post(doc).
            then(function (response) {
              Logger.debug('Added state:', response.id);
              return updateSettingsForm();
            });
        });

    }).fail(displayError);
  });


  /**
   * Delete a project. It must have no related documents.
   */
  $(document).on('click', 'a#settings-del-project', function (ev) {
    ev.preventDefault();
    jioConnect().then(function (jio) {
      var $selected = $('input:radio:checked[name=project-radio]'),
        project_title = $selected.data('jio-project'),
        project_id = $selected.data('jio-id');

      // query documents by project name, but query projects by id
      return countProjectDocuments(jio, project_title).
        then(function (document_count) {
          if (document_count) {
            return RSVP.reject({
              statusText: 'Cannot remove project "' + project_title + '"',
              message: 'The project contains ' + document_count + ' documents.'
            });
          }
          return jio.remove({_id: project_id});
        }).then(function () {
          Logger.debug('Project %s has been removed', project_title);
          return updateSettingsForm();
        });

    }).fail(displayError);
  });


  /**
   * Create a new project. Its name must be unique.
   */
  $(document).on('click', 'a#settings-add-project', function (ev) {
    ev.preventDefault();
    jioConnect().then(function (jio) {
      var project_title = window.prompt('Project name?') || '';

      project_title = project_title.trim();

      if (!project_title) {
        return;
      }

      project_title = project_title.charAt(0).toUpperCase() + project_title.slice(1);

      return checkProjectExists(jio, project_title).
        then(function (project_exists) {
          var doc = {
            type: 'Project',
            title: project_title,
            modified: new Date()
          };

          if (project_exists) {
            return RSVP.reject({
              statusText: 'Cannot add project',
              message: 'Project "' + project_title + '" already exists'
            });
          }

          return jio.post(doc).
            then(function (response) {
              Logger.debug('Added project:', response.id);
              return updateSettingsForm();
            });
        });

    }).fail(displayError);
  });



  /*********************
   *                   *
   * Application setup *
   *                   *
   ********************/

  if (!getSelectedStorage()) {
    setSelectedStorage(default_storage_id);
  }

  // avoid FOUC (http://en.wikipedia.org/wiki/Flash_of_unstyled_content)
  $('.initHandler').removeClass('initHandler');

  $.mobile.page.prototype.options.theme = appconfig.jqm_theme || 'a';
  $.mobile.selectmenu.prototype.options.nativeMenu = false;
  $.mobile.defaultPageTransition = 'none';


  if (!util.hasHTML5DatePicker()) {
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
    ns: {
      // load a generic and a mode specific translation
      namespaces: ['generic', appconfig.i18n_namespace],
      // default to generic if there is no namespace qualifier
      defaultNs: 'generic'
    },
    // keys missing from generic will be provided by the specific namespace
    fallbackNS: [appconfig.i18n_namespace],
    resGetPath: 'app/i18n/__lng__/__ns__.json',
    load: 'unspecific'
  }, applyTranslation);

  renderJS(window).ready(function (gadget) {
    root_gadget = gadget;
  });

  util.checkCacheUpdate();

});

