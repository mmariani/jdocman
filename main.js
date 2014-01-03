/*jslint indent: 2 */
/*global require */

(function () {
  "use strict";

  require.config({
    paths: {
      logger:          'lib/js-logger/logger',
      handlebars:      'lib/handlebars/handlebars-v1.1.2',
      task_util:       'modules/task-util',
      moment:          'lib/moment/moment-2.5.0',
      //plugins (require-css, text, json)
      css:             'lib/requirejs/plugins/require-css/css',
      normalize:       'lib/requirejs/plugins/require-css/normalize',
      text:            'lib/requirejs/plugins/text/text',
      json:            'lib/requirejs/plugins/json/json',
      i18next:         'lib/i18next/i18next.amd.withJQuery-1.7.1',
      // jQuery, jQuery mobile
      jquery:           'lib/jquery/jquery-1.10.2',
      jqm:              'lib/jqm/jquery.mobile-1.4.0-rc.1',
      // jio
      sha256:           'lib/jio/sha256.amd',
      rsvp:             'lib/jio/rsvp-custom.amd',
      jio:              'lib/jio/jio',
      complex_queries:  'lib/jio/complex_queries',
      jiodate:          'lib/jio/jiodate',
      localstorage:     'lib/jio/storage/localstorage',
      davstorage:       'lib/jio/storage/davstorage',
      erp5storage:      'lib/jio/storage/erp5storage',
      gidstorage:       'lib/jio/storage/gidstorage',
      replicatestorage: 'lib/jio/storage/replicatestorage',
      // overrides:       "modules/overrides"
    },
    shim: {
      'handlebars': {
        exports: 'Handlebars'
      }
    },
    // shim: {
    //     "jquery": {exports: "$"},
    //     "i18next": {deps: ["jquery"]},
    //     "jqm":     { deps: ["jquery"], exports: "mobile" },
    //     "overrides": {deps: ["jquery"]}
    // },
    map: {
      '*': {
        'css': 'lib/requirejs/plugins/require-css/css'
      }
    }
  });
  require(['modules/taskman', 'jquery'], function (taskman, $) {
    $(document).bind('mobileinit',function(){
      $.mobile.selectmenu.prototype.options.nativeMenu = false;
    });

    taskman.run();
  });
}());

