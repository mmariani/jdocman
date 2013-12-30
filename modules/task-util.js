/*jslint indent: 2 */
/*global define */

define(
  [
    'jquery',
    'handlebars',
    'i18next',
    'moment',
  ],
  function ($, Handlebars, i18next, moment) {
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


    util.registerHelpers = function () {
      // Truncate date strings to yyyy-mm-dd
      Handlebars.registerHelper('asYMD', function (date) {
        var m = moment(date);
        return new Handlebars.SafeString(m.format('YYYY-MM-DD'));
      });

      // Make translation accessible from within Handlebars templates
      Handlebars.registerHelper('t', function (i18n_key) {
        return new Handlebars.SafeString(i18next.t(i18n_key));
      });

      // XXX also see https://github.com/assemble/handlebars-helpers/blob/master/lib/helpers/helpers-comparisons.js
      Handlebars.registerHelper('ifCond', function (v1, operator, v2, options) {
        switch (operator) {
        case '==':
          return (v1 == v2) ? options.fn(this) : options.inverse(this);
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

    };


    return util;
  }
);

