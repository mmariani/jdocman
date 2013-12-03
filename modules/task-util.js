/*jslint indent: 2 */
/*global define */

define(
  [
    'jquery'
  ],
  function ($) {
    "use strict";

    var decode = function (str) {
        return decodeURIComponent(str.replace(/\+/g, ' '));
      },
      util = {};

    util.parseParams = function (query) {
      var params = {}, e, k, v, re = /([^&=]+)=?([^&]*)/g;
      if (query) {
        if (query.substr(0, 1) === '?') {
          query = query.substr(1);
        }

        while (e = re.exec(query)) {
          k = decode(e[1]);
          v = decode(e[2]);
          if (params[k] !== undefined) {
            if (!$.isArray(params[k])) {
              params[k] = [params[k]];
            }
            params[k].push(v);
          } else {
            params[k] = v;
          }
        }
      }
      return params;
    };

    util.jqmSetSelected = function (el, value) {
      // update a <select> element's selected option,
      // then activates the jquery mobile event to refresh UI
      var $select = $(el);

      $select.children().each(function (i, op) {
        if (op.getAttribute('value') === value) {
          op.setAttribute('selected', 'selected');
        }
      });

      $select.selectmenu('refresh');
    };

    return util;
  }
);

