TaskMan
=======

This application, other that its practical purpose, is intended to show best
practices of development with jIO + RenderJS and other libraries.

If you wish to analyze the source code, the starting point is modules/taskman.js,
the module itself is quite short.

It is recommended that you get familiar with the dependencies:

 * [jQuery](http://jquery.com) 2.1.x - you can use the less
   efficient 1.10.x if you care about older browsers.

 * [jQuery Mobile](http://jquerymobile.com/)
   is the framework that runs the application's code.
   Although it does not have many UI widgets as compared
   to some of the alternatives, with JQM it's easy to
   make the application mobile-first, and have it work
   everywhere.
   The most important difference with respect to regular
   web programming is the way JQM manages links, be sure
   to understand it.

 * [jIO](http://jio.readthedocs.org/) is used to save, query
   and retrieve documents.
   Currently, the application supports localStorage and WebDAV.
   Adding other types of storages from jIO is pretty easy.

 * [OfficeJS](https://github.com/nexedi/officejs)
   provides pluggable UI components
   for editing rich text, spreadsheets and SVG images.

 * [RenderJS](https://github.com/nexedi/renderjs)
   is the widget engine on which OfficeJS is based.

 * [Handlebars](http://handlebarsjs.com/)
   is a templating language for javascript.
   Very similar to mustache.js, it is extended by helper functions, to keep clean separation
   between the template and the code logic. You cannot directly write javascript inside
   the templates, but you can easily use a different engine if it works better for you:

   - [The client-side templating throwdown: mustache, handlebars, dust.js, and more](http://engineering.linkedin.com/frontend/client-side-templating-throwdown-mustache-handlebars-dustjs-and-more)
   - [Node.js template showdown – 5 options compared](http://www.bearfruit.org/2014/01/20/node-js-template-showdown-5-options-compared/)
   - [Template-Engine-Chooser](http://garann.github.io/template-chooser/)

   ..and if you don't use any of them, be sure to understand the security implications of HTML injection:

   - [Cross-site scripting - Reducing the threat](http://en.wikipedia.org/wiki/Cross-site_scripting#Reducing_the_threat)

 * [i18next](http://i18next.com/)
   is used to localize the application.
   Language packs can be preloaded (in this case we do, as they're very small) or only when needed,
   plenty of features and options are available.
   Whenever there is new content on the page, a call to $(selector).i18n() takes care of translating it.

 * [Moment.js](http://momentjs.com/)
   provides anything that is missing from the native Date object, including timezones and language-aware
   formatting.
   Here, Moment is used for parsing, formatting and to implement "partial" date
   searches, with the [JIODate](http://jio.readthedocs.org/en/latest/keys.html#partial-date-time-match) type.
   You can search for year, month, day, hour and so on, with the usual comparison operators.

 * To avoid "callback hell", jIO uses a [customized version](https://github.com/nexedi/jio/blob/master/lib/rsvp/rsvp-custom.js) of [RSVP.js](https://github.com/tildeio/rsvp.js)

   As you can see in TaskMan, promises are also used at the application and UI level.
   If you are not familiar with them, these are useful talks and slides:

   - [Promises, promises - an exploration of promises/A+ using rsvp.js](http://bantic.github.io/talks-promises/)
     ([video](http://www.youtube.com/watch?v=L1arcjb3Es8) and [sample code](http://jsbin.com/OqUWagu/24))
   - [Cleaning Up JavaScript Callbacks With Promises](http://www.youtube.com/watch?v=HWGfPx9yxEA)
   - [Callbacks are imperative, promises are functional: Node’s biggest missed opportunity](https://blog.jcoglan.com/2013/03/30/callbacks-are-imperative-promises-are-functional-nodes-biggest-missed-opportunity/)
   - [Five Patterns to Help You Tame Asynchronous JavaScript](http://tech.pro/blog/1402/five-patterns-to-help-you-tame-asynchronous-javascript)

   Also, recent versions of Firefox and Chrome have a native Promise implementation similar to RSVP:

   - [JavaScript Promises - There and back again](http://www.html5rocks.com/en/tutorials/es6/promises/)

   If you know jQuery's deferred objects are think they're good enough, [think again](http://domenic.me/2012/10/14/youre-missing-the-point-of-promises/).

 * [js-logger](https://github.com/jonnyreeves/js-logger)
   is a simple module that provides logging levels (DEBUG, INFO, WARNING..)

   If you need more features, have a look at [Woodman](https://github.com/joshfire/woodman) or [log4javascript](http://log4javascript.org/), which
   also provides an in-page console that can be useful to debug mobile browsers.

 * [Sanitize.js](https://github.com/gbirke/Sanitize.js)
   is an a HTML sanitizer, to help avoid HTML injections when displaying documents inserted
   by other users. It is used with bootstrap_wysiwyg and similar editors.

 * [jQuery UI Datepicker](https://github.com/arschmitz/jquery-mobile-datepicker-wrapper/) is used when the browser has no support for the HTML5 &lt;input type="date"&gt; element.

 * The [Appcache Manifest](ttp://en.wikipedia.org/wiki/AppCache) is necessary to make it sure the application can work in offline mode.
   Unfortunately, this is a little tricky to use correctly.

   A recommended reading is [Appcache Facts](http://appcachefacts.info/), which also points to several resources at the end of the page.


 RenderJS components (gadgets) are displayed within &lt;iframe&gt; elements, they are quite easy to create and each comes with its own dependencies.
 Gadgets conform to a simple API and can be easily replaced.

The following gadgets have been tested with the TaskMan application:

 * [bootstrap-wysiwyg](http://mindmup.github.io/bootstrap-wysiwyg/) ([renderjs component](https://github.com/nexedi/officejs/blob/jqs/src/gadget/bootstrap-wysiwyg.html)),
   a rich text / HTML editor.
   For an alternative that works well with jQuery Mobile and does not need Bootstrap,
   see [jQuery TE](http://jqueryte.com/).
   Many of the editors that predate the explosion of mobile devices have UI
   issues with mobile browsers, so if you need to evaluate a different one, be
   sure to test it there first.

 * [jQuery.sheet](http://visop-dev.com/Project+jQuery.sheet) ([renderjs component](https://github.com/nexedi/officejs/blob/jqs/src/gadget/jqs.html))
   is a spreadsheet with support for multiple sheets and formulas.

 * [svg-edit](https://code.google.com/p/svg-edit/) ([renderjs component](https://github.com/nexedi/officejs/blob/jqs/src/gadget/svgedit.html))
   is a vector graphics editor.


