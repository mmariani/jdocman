/*jslint indent: 2 */
/*global window, jQuery, Handlebars, i18n, moment */

(function ($, Handlebars, i18n, moment) {
  "use strict";

  var util = {};

  //
  // Update a <select> element's selected option,
  // then activates the jquery mobile event to refresh UI
  //
  util.jqmSetSelected = function (el, value) {
    var $select = $(el);

    /*jslint unparam: true*/
    $select.children().each(function (i, op) {
      if (op.getAttribute('value') === value) {
        op.setAttribute('selected', 'selected');
      }
    });
    /*jslint unparam: false*/

    $select.selectmenu('refresh');
  };


  util.createUUID = function () {
    var S4 = function () {
      return ('0000' + Math.floor(Math.random() * 0x10000).toString(16)).slice(-4);
    };
    return S4() + S4() + '-' + S4() + '-' + S4() + '-' + S4() + '-' + S4() + S4() + S4();
  };


  util.registerHelpers = function () {
    //
    // Display date strings or objects as yyyy-mm-dd
    // (takes timezone into account)
    //
    Handlebars.registerHelper('asYMD', function (date) {
      if (date) {
        return new Handlebars.SafeString(moment(date).format('YYYY-MM-DD'));
      }
      return '';
    });

    //
    // Make translation accessible from within Handlebars templates
    //
    Handlebars.registerHelper('t', function (i18n_key) {
      return new Handlebars.SafeString(i18n.t(i18n_key));
    });

    //
    // Add value comparisions, also see:
    // https://github.com/assemble/handlebars-helpers/blob/master/lib/helpers/helpers-comparisons.js
    //
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

  };


  //
  // Remove accents and convert to lower case
  //
  util.accentFoldLC = function (s) {
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


  window.task_util = util;
}(jQuery, Handlebars, i18n, moment));

