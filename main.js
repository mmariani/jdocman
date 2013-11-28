/*jslint indent: 2 */
/*global require */

(function () {
  "use strict";

  require.config({
    paths: {
      //plugins (require-css, text, json)
      css:             'lib/requirejs/plugins/require-css/css',
      normalize:       'lib/requirejs/plugins/require-css/normalize',
      text:            'lib/requirejs/plugins/text/text',
      json:            'lib/requirejs/plugins/json/json',
      // i18next:         "plugins/i18next/i18next-1.7.1",
      // jQuery, jQuery mobile
      jquery:           'lib/jquery/jquery-1.10.2',
      jqm:              'lib/jqm/jquery.mobile-1.4.0-rc.1',
      // jio
      sha256:           'lib/jio/sha256.amd',
      rsvp:             'lib/jio/rsvp-custom.amd',
      jio:              'lib/jio/jio',
      complex_queries:  'lib/jio/complex_queries',
      localstorage:     'lib/jio/storage/localstorage',
      davstorage:       'lib/jio/storage/davstorage',
      erp5storage:      'lib/jio/storage/erp5storage',
      gidstorage:       'lib/jio/storage/gidstorage',
      replicatestorage: 'lib/jio/storage/replicatestorage',
      // overrides:       "modules/overrides"
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
  require(["modules/taskman"], function (taskman) {
    console.log(taskman);
    taskman.run();
  });
}());

