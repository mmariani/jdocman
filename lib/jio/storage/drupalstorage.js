/*jslint indent: 2, maxlen: 80, nomen: true */
/*global define, jIO, btoa, b64_hmac_sha1, jQuery, XMLHttpRequest, XHRwrapper,
  FormData*/
/**
 * JIO S3 Storage. Type = "s3".
 * Amazon S3 "database" storage.
 */
// define([module_name], [dependencies], module);
(function (dependencies, module) {
  "use strict";
  if (typeof define === 'function' && define.amd) {
    return define(dependencies, module);
  }
  module(jIO);
}(['jio'], function (jIO) {
  "use strict";



  jIO.addStorage("drupal", function (spec) {
    var that, priv = {}, lastDigest, isDelete;
    that = this;

    //nomenclature param

    // param._id,
    //       ._attachment,
    //       ._blob

    // attributes
    priv.username = spec.username || '';
    priv.password = spec.password || '';
    priv.server = spec.server || '';
    priv.endpoint = spec.endpoint || '';
    priv.privateserver = spec.privateserver || '';
    priv.token = '';

    /**
     * Update [doc] the document object and remove [doc] keys
     * which are not in [new_doc]. It only changes [doc] keys not starting
     * with an underscore.
     * ex: doc:     {key:value1,_key:value2} with
     *     new_doc: {key:value3,_key:value4} updates
     *     doc:     {key:value3,_key:value2}.
     * @param  {object} doc The original document object.
     * @param  {object} new_doc The new document object
    **/

    priv.secureDocId = function (string) {
      var split = string.split('/'), i;
      if (split[0] === '') {
        split = split.slice(1);
      }
      for (i = 0; i < split.length; i += 1) {
        if (split[i] === '') {
          return '';
        }
      }
      return split.join('%2F');
    };

    priv.fileNameToIds = function (resourcename) {
      var split, el, id = "", attmt = "", last;
      split = resourcename.split('.');
      function replaceAndNotLast() {
        last = false;
        return '.';
      }
      /*jslint ass: true */
      while ((el = split.shift()) !== undefined) {
        last = true;
        el = el.replace(/__/g, '%2595');
        el = el.replace(/_$/, replaceAndNotLast);
        id += el.replace(/%2595/g, '_');
        if (last) {
          break;
        }
      }
      attmt = split.join('.');
      return [id, attmt];
    };

    priv.idsToFileName = function (document_id, attachment_id) {
      document_id = encodeURI(document_id).
        replace(/\//g, "%2F").
        replace(/\?/g, "%3F");
      document_id = encodeURI(document_id).
        replace(/_/g, "__").
        replace(/\./g, "_.");
      if (attachment_id) {
        attachment_id = encodeURI(attachment_id).
          replace(/\//g, "%2F").
          replace(/\?/g, "%3F");
        return document_id + "." + attachment_id;
      }
      return document_id;
    };

    /**
     * Removes the last character if it is a "/". "/a/b/c/" become "/a/b/c"
     * @method removeSlashIfLast
     * @param  {string} string The string to modify
     * @return {string} The modified string
     */
    priv.removeSlashIfLast = function (string) {
      if (string[string.length - 1] === "/") {
        return string.slice(0, -1);
      }
      return string;
    };


    /**
    * Generate a new uuid
    *
    * @method generateUuid
    * @private
    * @return {String} The new uuid
    */
    function generateUuid() {
      function S4() {
        /* 65536 */
        var i, string = Math.floor(
          Math.random() * 0x10000
        ).toString(16);
        for (i = string.length; i < 4; i += 1) {
          string = '0' + string;
        }
        return string;
      }
      return S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() +
        S4() + S4();
    }

    that.documentObjectUpdate = function (doc, new_doc) {
      var k;
      for (k in doc) {
        if (doc.hasOwnProperty(k)) {
          if (k[0] !== '_') {
            delete doc[k];
          }
        }
      }
      for (k in new_doc) {
        if (new_doc.hasOwnProperty(k)) {
          if (k[0] !== '_') {
            doc[k] = new_doc[k];
          }
        }
      }
    };

    /**
     * Checks if an object has no enumerable keys
     * @method objectIsEmpty
     * @param  {object} obj The object
     * @return {boolean} true if empty, else false
     */

    that.objectIsEmpty = function (obj) {
      var k;
      for (k in obj) {
        if (obj.hasOwnProperty(k)) {
          return false;
        }
      }
      return true;
    };

    // ===================== overrides ======================
    that.specToStore = function () {
      return {
        "username": priv.username,
        "password": priv.password,
        "server": priv.server
      };
    };

    that.validateState = function (){
      // xxx complete error message
      // jjj completion below

      if (typeof priv.AWSIdentifier === "string" && priv.AWSIdentifier === '') {
        return 'Need at least one parameter "Aws login".';
      }
      if (typeof priv.password === "string" && priv.password === '') {
        return 'Need at least one parameter "password".';
      }
      if (typeof priv.server === "string" && priv.server === '') {
        return 'Need at least one parameter "server".';
      }
      return '';
    };

    // =================== Drupal Specifics =================
     /**
     * Build the settings object that will be passed to the thenable promises
     * @param  {object} c The JIO command
     * @param  {object} m The document
     */
    function buildSettings(c,m){
      var setObj = {};
      setObj.command = c;
      setObj.data = m;
      setObj.data._id = setObj.data._id || generateUuid();
      //adds the .txt extension so Drupal gives the right mimetype
      setObj.file_name = priv.idsToFileName(setObj.data._id) + '.txt';
      return setObj;
    }

      /**
     * Get the Drupal token for a specific user
     * The private/public server flag is evaluated here to shorten the code
     */
    function getToken(o){
      return new Promise (function(resolve, reject){
        if (priv.privateserver && priv.token === ''){
          //if a private drupal server and the token is not set, grab the token
            if (priv.username && priv.password){
              //if credentials are fully completed make the post request
              var signature, xhr;
              signature = {};
              signature['username'] = priv.username;
              signature['password'] = priv.password;
              xhr = new XMLHttpRequest();
              xhr.open('POST', priv.server + '/' + priv.endpoint + '/user/login.json', true);
              xhr.onreadystatechange = function(){
                if (this.readyState == 4){
                  if (this.status == 200){
                    //if ok, set the token
                    priv.token = JSON.parse(this.responseText)['token'];
                    resolve(o);
                  } else {
                    return 'HTTP Code 200 was expected while retrieving the token.';
                  }
                }
              }
              xhr.setRequestHeader("Content-Type", "application/json");
              xhr.send(JSON.stringify(signature));
            } else {
              return 'Need at least two parameters for authentication "user"+"password".';
            }
        } else {
          //if it is a public drupal server, resolve by default
          resolve(o);
        }
      })
    };

     /**
     * Wraps the different post requests and callbacks
     * @param  {object} o The promise settings object
     */
    function postMethodWrapper(o){
      return new Promise (function(resolve, reject){
        var fileTemplate, xhr;
        //this is the expected json object format by Drupal (Drupal v7, Services v3)
        fileTemplate = {
          "fid":"",
          "uid":"",
          "filename":"",
          "uri":"",
          "filemime":"text/plain",
          "filesize":"",
          "status":"",
          "timestamp":"",
          "rdf_mapping":[],
          "uri_full":"",
          "target_uri":"",
          "file":"",
          "image_styles":[]
        }

        fileTemplate.filename = o.file_name;
        fileTemplate.file = btoa(JSON.stringify(o.data));
        fileTemplate = JSON.stringify(fileTemplate);

        xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function(){
          var settings = o;
          if (this.readyState == 4){
            switch (settings.state) {
              case 'that.post:initial post to get file id' :
                if (this.status == 200){
                  //store the current file index
                  settings.fid = JSON.parse(this.responseText).fid;
                  //set the final file index
                  settings.data.fid = (parseInt(settings.fid)+1).toString();
                  console.dir(settings)
                  resolve(settings);
                } else if (this.status == 409){
                  return settings.command.error(
                  409,
                  "Document already exists",
                  "Cannot create document"
                );
                } else {
                  return settings.command.error(
                  500,
                  "HTTP Code 200 was expected when first creating the document",
                  "Cannot create document"
                );
                }
              break;
              case 'that.post:second post with updated metadata document' :
                if (settings.data.fid == JSON.parse(this.response).fid){
                  settings.command.success(this.status, {id: settings.data._id});
                } else {
                  return settings.command.error(
                  500,
                  "The file index stored in the metadata doesn't match the fid callback",
                  "Cannot post document"
                  );
                }
              break;
            }
          }
        }

        xhr.open('POST', priv.server + '/' + priv.endpoint + '/file', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Accept', 'application/json');
        if (priv.privateserver){
          xhr.setRequestHeader('X-CSRF-Token', priv.token);
        }
        xhr.send(fileTemplate);
      })
    };

     /**
     * Wraps the different get requests and callbacks
     * @param  {object} o The promise settings object
     */
    function getMethodWrapper (o){
      return new Promise(function(resolve,reject){
        var xhr;
        xhr = new XMLHttpRequest();

        xhr.onreadystatechange = function(){
          var settings = o;
          if (this.readyState == 4){
            switch (settings.state){
              case 'that.post:get request to check if document exists':
                if (this.status == 404){
                  resolve(settings);
                } else {
                  return obj.command.error(
                  200,
                  "Document already exists",
                  "Cannot create document"
                  );
                }
              break;
              case 'that.get:get the document':
                if (this.status == 200){
                  settings.command.success(this.status, {'data': this.responseText});
                } else {
                  return settings.command.error(
                  404,
                  "Document not found",
                  "Cannot get document"
                  );
                }
              break;
              case 'that.remove : get the document':
                if (this.status == 200){
                  settings.data = this.responseText;
                  resolve(settings);
                } else {
                  return settings.command.error(
                  404,
                  "Document not found",
                  "Cannot delete document"
                  );
                }
              break;
            }
          }
        }

        xhr.open('GET', priv.server + '/sites/default/files/'+o.file_name, true);
        xhr.send();
      })
    };

     /**
     * Wraps the different delete requests and callbacks
     * @param  {object} o The promise settings object
     */
    function deleteMethodWrapper(o){
      return new Promise (function(resolve, reject){
        var xhr = new XMLHttpRequest();

          xhr.onreadystatechange = function(){
            var settings = o;
            if (this.readyState == 4){
              switch (settings.state){
                case 'that.post:delete temp fid document' :
                  if (this.status == 200){
                    resolve(settings)
                  } else {
                    return command.error(
                    500,
                    "HTTP Code 200 was expected",
                    "Cannot delete document"
                  );
                  }
                break;
                case 'that.remove : delete the document' :
                  settings.command.success(this.status);
                break;
              }
            }
          }
          //if o.fid is not set then we target the document file index for the request
          o.fid = o.fid || JSON.parse(o.data).fid;
          xhr.open('DELETE', priv.server + '/?q=' +priv.endpoint + '/file/' + o.fid, true);

          if (priv.privateserver){
            xhr.setRequestHeader('X-CSRF-Token', priv.token);
          }

          xhr.send();
      })
    }

    // ==================== commands ====================
    /**
     * Create a document on a distant Drupal server
     * @method post
     * @param  {object} command The JIO command
     * @param  {object} metadata The document
    **/

    that.post = function (command, metadata) {
      var o;
      o = buildSettings(command, metadata);

      //Promise chain
      getToken(o)
        //check if the document exists
      .then(function(result){
        result.state = 'that.post:get method to check if document exists';
        return getMethodWrapper(result);
      })
        //post a document to get the file index (fid) callback
      .then(function(result){
        result.state = 'that.post:initial post to get file id';
        return postMethodWrapper(result);
      })
        //delete the document before re-posting the updated file index (fid) metadata document
      .then(function(result){
        result.state = 'that.post:delete temp fid document';
        return deleteMethodWrapper(result);
      })
        //post the updated file index (fid) metadata document
      .then(function(result){
        result.state = 'that.post:post updated file index document';
        return postMethodWrapper(result);
      })
    };

    /**
    * Get a document
    * @method get
    * @param  {object} command The JIO command
    * @param  {object} metadata The document
    **/

    that.get = function (command, metadata) {
      var o;
      o = buildSettings(command, metadata);

      //Promise chain
      getToken(o)
      .then(function(result){
        //get the document
        result.state ='that.get:get the document';
        getMethodWrapper(result);
      })
    };

    /**
    * Remove a document
    * @method remove
    * @param  {object} command The JIO command
    * @param  {object} metadata The document
    **/

    that.remove = function (command, metadata) {
      var o;
      o = buildSettings(command, metadata);

      //Promise chain
      getToken(o)
        //get the document in order to get the file index (fid) key
      .then(function(result){
        result.state = 'that.remove : get the document';
        return getMethodWrapper(result);
      })
        //delete the document on the right file index (fid) key
      .then(function(result){
        result.state = 'that.remove : delete the document';
        return deleteMethodWrapper(result);
      })
    };

  });
}));
