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


    // Update a <select> element's selected option,
    // then activates the jquery mobile event to refresh UI
    util.jqmSetSelected = function (el, value) {
      var $select = $(el);

      $select.children().each(function (i, op) {
        if (op.getAttribute('value') === value) {
          op.setAttribute('selected', 'selected');
        }
      });

      $select.selectmenu('refresh');
    };


    // Check if a date object is valid.
    util.isValidDate = function (d) {
      if (Object.prototype.toString.call(d) !== "[object Date]") {
        return false;
      }
      return !isNaN(d.getTime());
    };


    util.createUUID = function () {
      var S4 = function () {
        return ('0000' + Math.floor(Math.random() * 0x10000).toString(16)).slice(-4);
      };
      return S4() + S4() + '-' + S4() + '-' + S4() + '-' + S4() + '-' + S4() + S4() + S4();
    };


    return util;
  }
);

