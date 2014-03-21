

Writing mobile OfficeJS applications
====================================

This tutorial dissects an existing application and shows how to write programs that:

 - Run in any modern browser (IE9+), both mobile and desktop, with [jQuery Mobile](http://jquerymobile.com/).

 - Manage data with [jIO](http://jio.readthedocs.org/).
   When offline, the data is stored locally. When online, the data is automatically synchronized with backend servers, if needed.

 - Let the user edit any kind of document through simple [OfficeJS](https://github.com/nexedi/officejs) plugins.

 - Can work with no access to the network, by using the [Appcache](ttp://en.wikipedia.org/wiki/AppCache).
   In this case, IE9 is not supported. AppCache requires IE10 or later.


A prerequisite is some knowledge of JavaScript, jQuery and Web development.

You can follow the documentation of each of the above projects, or keep reading and go back to them later.



The jDocMan app - as a Task Manager
-----------------------------------

The demo application allows the creation of a list of tasks, each with a state
of completion, grouped into projects. A title, a description, and range of dates
are also properties of each task.

The source is available on [GitHub](https://github.com/nexedi/jdocman/tree/tutorial)

To download it:

    $ git clone -b tutorial https://github.com/nexedi/jdocman.git

To analyze the source code, the starting points are [index.html](https://github.com/nexedi/jdocman/blob/tutorial/index.html) and
[app/main.js](https://github.com/nexedi/jdocman/blob/tutorial/app/main.js).

You can also try the application online at [http://taskman.app.officejs.com/](http://taskman.app.officejs.com/)

To create some test data, click _Settings_ -> _Import_ -> _insert test data_ -> _Import_.

By default, all the data is kept in the [localStorage](https://developer.mozilla.org/en-US/docs/Web/Guide/API/DOM/Storage),
which means it remains inside the browser.

Several data storages can be configured, in the _Settings_ page, and the user can switch between them with the selection
menu.



The jDocMan app - as a Document Manager
---------------------------------------

By setting the APPLICATION_MODE variable, the same application can also be used to edit documents.
In this case, what we referred to as "Task" becomes the "Metadata" (or simply Properties) of the document.

You can try such version at [http://taskman-editor.app.officejs.com/](http://taskman-editor.app.officejs.com/)

Clicking on a search result opens the document, with the [bootstrap-wysiwyg](https://github.com/mindmup/bootstrap-wysiwyg) HTML editor.

The HTML editor is an OfficeJS gadget.
It is placed in a full-screen iframe, and is completely independent from the rest of the application.

From the footer bar at the bottom of the page, you can save the document, edit the properties, or delete both
metadata properties and HTML document.

The best thing about OfficeJS is that gadget components can be easily swapped to manage different types of documents, like a Spreadsheet
or an SVG drawing:

 * [http://taskman-spreadsheet.app.officejs.com/](http://taskman-spreadsheet.app.officejs.com/)

 * [http://taskman-svg.app.officejs.com/](http://taskman-svg.app.officejs.com/)




Setting up a development environment
------------------------------------

If you try to load the index.html page from the filesystem, you will see that it works
pretty well with Firefox, but Chrome displays error messages in the JavaScript console:

```
XMLHttpRequest cannot load file:///home/marco/src/jdocman/app/i18n/en/editor.json.
 No 'Access-Control-Allow-Origin' header is present on the requested resource.
 Origin 'null' is therefore not allowed access.
XMLHttpRequest cannot load file:///home/marco/src/jdocman/app/i18n/en/generic.json.
 No 'Access-Control-Allow-Origin' header is present on the requested resource.
 Origin 'null' is therefore not allowed access.
```

This is due to the [Same-origin policy](http://en.wikipedia.org/wiki/Same-origin_policy) which is more restrictive for some browsers.

The recommended way to setup up a development environment is to use a (remote or local) web server.

There are multiple ways to do it:

 1. Go to the shell, in the folder that contains index.html, then run:

    $ python2 -m SimpleHTTPServer 8000

    or

    $ python3 -m http.server 8000

    The application will be available at http://localhost:8000/

 2. Fork the repository on github, and push a branch named "gh-pages".

    The application will be accessible from everywhere at your-account.github.io/jdocman

 3. Install nginx and use this configuration:

    ```
    location /jdocman/ {
        alias /home/username/src/jdocman/;
        autoindex on;
        allow 127.0.0.1;
        allow ::1;
        deny all;
    }
    ```

   The application will be accessible at http://localhost/jdocman/, only from the localhost.



Developing with jQuery Mobile (JQM)
-----------------------------------

([demos](http://demos.jquerymobile.com/) and [API](http://api.jquerymobile.com/) documentation)

Pay attention when searching for JQM documentation, because sometimes the google results link to older versions.

The JQM framework may at first appear as a library of widgets, but most important difference with respect
to traditional web programming is the way JQM manages links and page loading, be sure to understand it.

JQM can be used in two ways: traditional multiple HTML files, or single HTML file with multiple pages inside - which is what we do.

If you look at the [index.html](https://github.com/nexedi/jdocman/blob/tutorial/index.html) file,
there are many &lt;section data-role="page"&gt; elements.
If this had been a plain web application, with no jQuery Mobile, each of the sections would be in a separate
HTML file.

In the context of JQM, a "page" is defined as an element that has the attribute data-role="page".

If a page has id="foo", clicking on a link with href="#foo" will bring that page to the foreground, and emit the corresponding
[events](https://api.jquerymobile.com/category/events/).

Multiple HTML files each containing multiple pages are also possible.



jQuery Mobile - Navigation and Events
-------------------------------------

The main application entry point is

 * [mobileinit](https://api.jquerymobile.com/mobileinit/)

    This event handler is used like $(document).ready() in plain jQuery.

    ```js
    $(document).on('mobileinit', function () {
      // application code
    })
    ```

    The event is fired only once, when JQM is ready.
    Note that the main.js file must be loaded before jquery.mobile.js

    See also [Understanding the Mobile Initialization Event](http://www.informit.com/articles/article.aspx?p=1924978&seqNum=4)


We are also using a few events related to page navigation:

 * [pagecreate](https://api.jquerymobile.com/pagecreate/) is fired once per
   each page, the first time it is shown (i.e. created in the DOM). It will not
   fire again if the user goes to a second page and comes back.

 * [pagebeforechange](https://api.jquerymobile.com/pagebeforechange/) global
   (not bound to a page) and is fired twice for each page change. See below for
   how it's been used.

 * [pageshow](https://api.jquerymobile.com/pageshow/) is fired every time a
   page is shown. Not to be confused with [pagecreate](https://api.jquerymobile.com/pagecreate/)
   which fires only the first time for each page, nor with [pageload](https://api.jquerymobile.com/pageload/)
   which fires when a page is loaded from an external HTML file.

 * [pagebeforeshow](https://api.jquerymobile.com/pagebeforeshow/) is fired
   *before* the 'pageshow' event. It can be used to refresh the content of
   pages BOTH when loading AND after going back to them. For instance, from the
   document list we create a document, then click 'Save'. The navigation goes back
   to the document list, where a new query is performed on the 'pagebeforeshow'
   event and the list template is rendered again, including the new document.


The way we use the above events is a little tricky, and the reason is a combination of
the following assumptions.

 - We want to be able to pass parameters between pages (for instance, document_id
   must be provided to the page that will load it)

 - We want to be able to refresh pages with F5, or bookmark and return to them
   (therefore, the document_id must be stored as part of the URL, keeping it in a
   JavaScript variable is not enough)

 - The application must be able to work offline
   (we cannot use the usual index.html?foo=bar syntax, see [Dear AppCache We Need to Talk](http://paul.kinlan.me/dear-appcache/))

 - jQuery mobile regards everything after the '#' character in the URL (the
   fragment identifier) as a page id


If we pass the parameters in the usual way "index.html?document_id=873847#document-page", then when
we are offline, AppCache will look for a file named "index.html?document_id=873847" (instead of index.html)
and will not find it.

We might store the parameters after the page identifier, and go to #document-page?document_id=873847.
AppCache ignores everything about the '#', so that's ok.
But JQM will look for a page named "document-page?document_id=873847" (instead of "document-page")

So here we apply the trick. The target URL (the jQMData('url') attribute) is temporarily changed
to include the full string with parameters, then it is changed back after the page is shown.

Hopefully, with the next release of JQM (1.5) this will not be necessary anymore. Right now, you
can see the related code in the 'pageshow', 'pagecreate' and 'pagebeforechange' events, as well
as the gotoPage() function which is used instead of the standard $.mobile.changePage() provided by JQM.

There is another custom event (not native to JQM), that you need to be aware of.
It works a bit like 'pagebeforeshow' with the difference that it won't be fired by the "Back" buttons:

 * pagerender

    Here, for dynamic pages, we collect the data to display, and pass it to a Handlebars
    template which renders an HTML fragment that is injected inside the DOM.

During `pagerender` it may be needed to access the DOM element of the new page, and the
arguments that have been passed. Since $.mobile.activePage and window.location may not
have been updated yet (depending on whether it's a first load or a transition from another page),
the ev.page and ev.args objects are passed inside the event:

```js
$(document).on('pagerender', '#my-page', function (ev) {
  var page = ev.page,
    foo = ev.args.foo,
    bar = ev.args.bar;
    [...]
}
```




Handlebars Templates
====================

Beside keeping the code cleaner and easier to debug, using a template library allows a developer to create dynamic HTML pages
while avoiding [HTML Injection](http://en.wikipedia.org/wiki/Code_injection#HTML_Script_Injection),
which is a common security issue. See also [Cross-site scripting - Reducing the threat](http://en.wikipedia.org/wiki/Cross-site_scripting#Reducing_the_threat)

We decided to use [Handlebars](http://handlebarsjs.com/).

As an example, let's consider the 'settings' form, which is defined in the following template:

```Handlebars
<script id="settings-form-template" type="text/x-handlebars-template">
  <form action="javascript:void(0);">
    [...]

    {{#if error_message}}
      <h3>Cannot connect to the storage</h3>
      <p>{{error_message}}</p>
    {{else}}
    [...]

    <fieldset data-role="controlgroup" data-mini="true">
      <legend data-i18n="settings.projects">Projects:</legend>
      {{#project_list}}
      <label data-i18n="{{this.doc.project}}">
        <input type="radio" name="project-radio"
               data-jio-project="{{this.doc.project}}"
               data-jio-id="{{this.id}}" />
          {{this.doc.project}}
        </label>
      {{/project_list}}
    </fieldset>
    <fieldset data-role="controlgroup" data-mini="true" data-type="horizontal">
      {{#if project_list}}
      <a href="#" id="settings-del-project"
         data-role="button" data-icon="delete" data-inline="true">
        Delete
      </a>
      {{/if}}
      <a href="#" id="settings-add-project"
         data-role="button" data-icon="plus" data-inline="true">
        New Project
      </a>
    </fieldset>
    {{/if}}
  </form>
```


Handlebars [expressions](http://handlebarsjs.com/expressions.html) are defined by the double bracket markup: {{...}}

Here they are used to

 - conditionally include either an error message or a list of projects
 - loop over the projects themselves
 - generate radio buttons with name and id of each project

All the templates are compiled in advance for better performance:

```js
template = {
  [...]
  'settings-form': Handlebars.compile($('#settings-form-template').text()),
  [...]
},
```


This particular template is rendered inside the updateSettingsForm() function.

```js
function updateSettingsForm() {
  [...]
    $('#settings-form-container').
      html(template['settings-form']({
        error_message: error_message,
        project_list: project_list
      })).
      trigger('create');
  [...]
})
```


After injecting the rendered code, JQM must be informed through the 'create' event, so that it can apply its own markup and behavior.

For design reasons, to keep presentation and code logic separated, bracket pairs cannot directly contain JavaScript code,
but new expression types can be added with _helper_ functions.
You can find [collections of helpers](http://assemble.io/helpers/) for every need.

Templates can also include each other, see for instance #document-link-partial which is used by both #document-list-template and #project-list-template.



Promises
========

Every JavaScript developer should be familiar with the concept of [callback](http://en.wikipedia.org/wiki/Callback_(computer_programming)#JavaScript).

While callbacks are enough for simple asynchronous jobs, nesting too many of them can often lead to code that is hard to maintain and debug.
Error handling and progress notifications become especially tricky to implement.

To avoid this so-called [callback hell](http://ianbishop.github.io/blog/2013/01/13/escape-from-callback-hell/)
or [pyramid of doom](http://tritarget.org/blog/2012/11/28/the-pyramid-of-doom-a-javascript-style-trap/),
a popular design pattern is the [Promise](http://en.wikipedia.org/wiki/Promise_(programming)).

The jIO methods support both the callback and promise syntaxes.

You can compare the two examples in the [tutorial](https://github.com/nexedi/jdocman/blob/tutorial/tutorial/) folder.

This is the version with callbacks:

```js
jio.put({
  type: 'Document',
  title: 'An example document',
  _id: 'doc1'
}, function (response) {
  console.log('Document', response.id, 'created');
  jio.putAttachment({
    _id: 'doc1',
    _attachment: 'attachment_name',
    _data: new Blob(['lorem ipsum'], {type: 'text/plain'})
  }, function (response) {
    console.log('Attachment', response.attachment, 'created on', response.id);
    jio.get({_id: 'doc1'}, function (response) {
      console.log('Retrieved document', response.id);
      jio.getAttachment({
        _id: 'doc1',
        _attachment: 'attachment_name',
      }, function (response) {
        console.log('Retrieved attachment', response.attachment, 'from', response.id);
        var fr = new FileReader();
        fr.addEventListener('load', function (event) {
          console.log('Attachment content:', event.target.result);
          jio.remove({_id: 'doc1'}, function (response) {
            console.log('Document', response.id, 'removed');
            console.log('DONE!');
          }, errorHandler);
        });
        fr.addEventListener('error', errorHandler);
        fr.readAsText(response.data);
      }, errorHandler);
    }, errorHandler);
  }, errorHandler);
}, errorHandler);
```

And here the equivalent code with promises:

```js
jio.
  put({
    type: 'Document',
    title: 'An example document',
    _id: 'doc1'
  }).
  then(function (response) {
    console.log('Document', response.id, 'created');
    return jio.putAttachment({
      _id: 'doc1',
      _attachment: 'attachment_name',
      _data: new Blob(['lorem ipsum'], {type: 'text/plain'})
    });
  }).
  then(function (response) {
    console.log('Attachment', response.attachment, 'created on', response.id);
    return jio.get({_id: 'doc1'});
  }).
  then(function (response) {
    console.log('Retrieved document', response.id);
    return jio.getAttachment({
      _id: 'doc1',
      _attachment: 'attachment_name',
    });
  }).
  then(function (response) {
    console.log('Retrieved attachment', response.attachment, 'from', response.id);
    return jIO.util.readBlobAsText(response.data);
  }).
  then(function (event) {
    console.log('Attachment content:', event.target.result);
  }).
  then(function () {
    return jio.remove({_id: 'doc1'});
  }).
  then(function (response) {
    console.log('Document', response.id, 'removed');
    console.log('DONE!');
  }).
  fail(function (error) {
    console.error(error);
  });
```


You should notice that the second version is easier to maintain, the code does not have nested functions
and nedds a single point to handle all the errors. If we were to add more advanced features (progress notification,
queues, cancellation) the difference would be even more striking.

We use promises a lot, and among the alternatives we chose a [customized version](https://github.com/nexedi/jio/blob/master/lib/rsvp/rsvp-custom.js)
of [RSVP.js](https://github.com/tildeio/rsvp.js).
In the future, there will be no need for external Promise libraries and browsers will have a standard, [native implementation](http://www.html5rocks.com/en/tutorials/es6/promises/).

A good introduction to the matter is the talk [Promises, promises - an exploration of promises/A+ using rsvp.js](http://bantic.github.io/talks-promises/)
(with [video](http://www.youtube.com/watch?v=L1arcjb3Es8) and [sample code](http://jsbin.com/OqUWagu/24)).



Translation / i18next
=====================

There is not much to say here about the [i18next](http://i18next.com/) library, except that it is well documented and it just works.

Not all of the app content is translated, but the plumbing is there, and you can switch language in real time from the _Settings_ page.
It will be stored in a cookie appropriately named 'i18n'.

Every time some content is injected in the current page (for instance, by rendering a template or updating some element) this
simple function is called to apply translations where needed:

```js
/**
 * Immediately apply translation to all elements
 * which have a data-i18n attribute.
 */
function applyTranslation() {
  $('[data-i18n]').i18n();
}
```

The [Has Attribute Selector](https://api.jquery.com/has-attribute-selector/) may not be efficient for large pages (especially it scans the whole document),
but works pretty well in this case.

A small Handlebars helper is also used to translate while rendering:

```js
/**
 * Make translations accessible from within Handlebars templates
 */
Handlebars.registerHelper('t', function (i18n_key) {
  return i18n_key ? new Handlebars.SafeString(i18n.t(i18n_key)) : '';
});
```

To use it, simply call it with a string argument:

    <span class="state">{{t this.doc.state}}</span>

A specific need of this application is that we always use two translation files: one is generic, and the other is specific
to the operating mode (task manager, HTML editor, spreadsheet, SVG). You can see that in the call to $.i18n.init().
Your configuration may be simpler.



Using jIO - jioConnect()
========================

Now that we saw how the page content is managed, let's take a closer look at how data is stored and retrieved.

If you haven't done so already, read the documentation of [jIO](http://jio.readthedocs.org/en/latest/), at least [Getting started](http://jio.readthedocs.org/en/latest/getting_started.html)
and [How to manage documents?](http://jio.readthedocs.org/en/latest/manage_documents.html).

Don't worry if you don't understand everything, we'll see how the jIO API is used in the context of this application.

As a simple example, consider a user that clicks on the 'Delete Document' button...

```js
/**
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
```


and see what happens:

 - A *document_id* parameter is retrieved from the URL of the current page.
 - When the *jioConnect()* function is called, it returns a Promise.
 - When the promise returned by jioConnect() is fullfilled, the *do_remove()* function is called, and receives a jio instance.
 - do_remove() deletes the object from the storage, then returns a Promise again, that will be fullfilled once the removal has been confirmed.
 - After receiving confirmation that the document has been removed, *do_back()* is called.
   The format of the _response_ parameter is documented in http://jio.readthedocs.org/en/latest/manage_documents.html#method-options-and-callback-responses
 - The user is sent back to the page he went from - either document list, or project list.
 - If any error from jIO, or any JavaScript exception occurs, the displayError() function is called, and it will display a popup to the user.


If there was no need to allow multiple storages that can be swapped at runtime, the code could be simplified, and avoid using jioConnect():

```js
// at the beginning of the module
jio = jIO.createJIO(storage_description)
[...]

// inside the event handler
jio.remove({_id: document_id}).
  then(function () {
    parent.history.back();
  }).
  fail(displayError);
```


Keep in mind, a single storage_description does not mean we only store data in a single place. It might still describe a replicated storage
with local and remote substorages. The difference is that, in this simpler case, the type and behavior of the storages is fixed and cannot
change with a click of a button.


Using jIO - configuration storage
=================================

As we said, in jDocMan we can define several storages. Each of them is created from a "configuration object", that may contain
access URLs, authentication tokens, etc.

Configuration objects are stored in a separate *jio_config* storage, that is always of type "localstorage".

The configuration storage is accessed through the *jioConfigConnect()* function, that works just like jioConnect(), but it fullfills
with the *jio_config* object instead of *jio*.

Here is an example with the removal of a storage configuration. This is very similar to the event handler described in the
previous section.


```js
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
```



Using jIO - attachments
=======================

A jIO document can optionally contain attachments.
jDocMan uses attachments for HTML/Spreadsheet/SVG documents, but also for configuration objects.


This is the response of a call to jio_config.get({_id: 'default_storage'}):

```JSON
{
    "modified": "2014-03-17T15:45:12.765Z",
    "type": "Storage Configuration",
    "_id": "default_storage",
    "_attachments": {
        "config": {
            "content_type": "application/json",
            "digest": "sha256-b0bc3c1c4f886532a9276677fe9df56c0288ff810434fdab961545521bc8dc76",
            "length":68
        }
    }
}
```



As you see, the configuration itself is not part of the response, but the response provides information
about an existing attachment named "config".

Retrieving the attachment requires a separate call:

```js
jio_config.getAttachment({_id: 'default-storage', _attachment: 'config'})
```

This time, the response is

    "{\"storage_type\":\"local\",\"username\":\"Admin\",\"storage_name\":\"Local-1\"}"

which is, as expected from the content_type, a JSON string.


Here is the full function.

```js
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
```


It returns a promise:

```js
storageConfig(jio_config, storage_id).
  then(function (config) {
    Logger.info('Storage type', config.storage_type);
    Logger.info('Username', config.username);
  });
```




Using OfficeJS
==============

OfficeJS components (gadgets) are displayed within &lt;iframe&gt; elements, they are quite easy to create and each comes with its own dependencies.

The following gadgets have been tested with the application:

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



Two generic functions are responsible for the loading, rendering and saving of
attachment editors. Every gadget exposes at least three methods: _.getContent()_,
_.setContent()_ and _.clearContent()_. We need only the first two.

As usual, gadgets are used with Promises:


```js
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
```



Saving a gadget's content is even easier:


```js
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
```


Note that the same functions can manage a huge variety of editors, the only thing we need
to change to add an editor is the object returned by getApplicationConfig(). In most cases,
providing a new gadget.url is enough - it should point to the main HTML page of the gadget.

Please refer to the [RenderJS](http://www.renderjs.org/) documentation for further details.

RenderJS is the widget engine on which OfficeJS is based.



The Application Cache
=====================

The [AppCache Manifest](ttp://en.wikipedia.org/wiki/AppCache) is a text file which instructs the browser about
what parts of the application have to be preloaded, and cached for offline use.
The manifest must be referenced in each of the HTML files:

 * &lt;html manifest="manifest.appcache"&gt;

The format of the file is simple, but it requires some attention to work with.
The resources listed under the "CACHE:" section will be used *instead* (not in _preference_) of their
remote counterparts.

When debugging the application, most of the times we need to use the most recent version, therefore in our repository
the file is named 'manifest.appcache.disabled' and only renamed before publishing a release.

The manifest file must also be changed each time a version of the app is released. Changing the date and version number
inside the commented line is enough to force clients to reload everything.

Please take some time to read how it works in detail:

 * [Using the application cache](https://developer.mozilla.org/en-US/docs/HTML/Using_the_application_cache)
 * [Appcache Facts](http://mmariani.github.io/appcachefacts/)

And remember the first rule of the AppCache Manifest: never cache the manifest itself.
Doing so would mean the browser will never attempt to load a new version of the app.

In Chrome, you can inspect the state of the appcache by going to chrome://appcache-internals/



Additional resources
====================

jQuery Mobile:

 * [O'Reilly Webcast: The jQuery Mobile API In-Depth](http://www.youtube.com/watch?v=I6Y4a0hA8tI) (youtube)
 * [jQuery Mobile: document ready vs page events](http://stackoverflow.com/questions/14468659/jquery-mobile-document-ready-vs-page-events) (stackoverflow)
 * [jQuery Mobile Icon Pack](https://github.com/commadelimited/jQuery-Mobile-Icon-Pack)

Promises:

 * [Cleaning Up JavaScript Callbacks With Promises](http://www.youtube.com/watch?v=HWGfPx9yxEA)
 * [Callbacks are imperative, promises are functional: Node’s biggest missed opportunity](https://blog.jcoglan.com/2013/03/30/callbacks-are-imperative-promises-are-functional-nodes-biggest-missed-opportunity/)
 * [Five Patterns to Help You Tame Asynchronous JavaScript](http://tech.pro/blog/1402/five-patterns-to-help-you-tame-asynchronous-javascript)
 * Recent versions of Firefox and Chrome have a native Promise implementation similar to RSVP: [JavaScript Promises - There and back again](http://www.html5rocks.com/en/tutorials/es6/promises/)
 * If you know jQuery's deferred objects are think they're good enough, [think again](http://domenic.me/2012/10/14/youre-missing-the-point-of-promises/)


Some useful collections of JavaScript libraries:

 * [JSDB.IO](http://www.jsdb.io/)
 * [microjs](http://microjs.com/)

If for some reason you don't like Handlebars, there are many other template libraries to choose from:

 * [Template-Engine-Chooser](http://garann.github.io/template-chooser/)
 * [microjs / templating](http://microjs.com/#templating)
 * [JavaScript templates](https://developer.mozilla.org/en-US/docs/JavaScript_templates) (MDN)
 * [The client-side templating throwdown: mustache, handlebars, dust.js, and more](http://engineering.linkedin.com/frontend/client-side-templating-throwdown-mustache-handlebars-dustjs-and-more)
 * [Node.js template showdown – 5 options compared](http://www.bearfruit.org/2014/01/20/node-js-template-showdown-5-options-compared/)


If you need to validate form input, [jQuery.validVal](http://validval.frebsite.nl/) works pretty well with jQuery Mobile.

For a logger library with more features than [js-logger](https://github.com/jonnyreeves/js-logger), have a look at
[Woodman](https://github.com/joshfire/woodman) or [log4javascript](http://log4javascript.org/), which also provides an in-page
console that can be useful to debug mobile browsers.


