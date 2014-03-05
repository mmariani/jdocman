/*
 * Copyright 2013, Nexedi SA
 * Released under the LGPL license.
 * http://www.gnu.org/licenses/lgpl.html
 */
/**
 * JIO Dropbox Storage. Type = "dropbox".
 * Dropbox "database" storage.
 */
/*global FormData, btoa, Blob, CryptoJS */
/*jslint nomen: true, unparam: true, bitwise: true */
(function (dependencies, module) {
  "use strict";
  if (typeof define === 'function' && define.amd) {
    return define(dependencies, module);
  }
  module(jIO);
}([
  'jio'
], function (jIO) {
  "use strict";
  var UPLOAD_URL = "https://api-content.dropbox.com/1/";

  /**
   * The JIO DropboxStorage extension
   *
   * @class DropboxStorage
   * @constructor
   */
  function DropboxStorage(spec) {
    if (typeof spec.access_token !== 'string' || !spec.access_token) {
      throw new TypeError("Access Token' must be a string " +
                          "which contains more than one character.");
    }
    this._access_token = spec.access_token;
  }

  // Storage specific put method
  DropboxStorage.prototype._put = function (key, blob, path) {
    var data = new FormData();
    if (path === undefined) {
      path = '';
    }
    data.append(
      "file",
      blob,
      key
    );
    return jIO.util.ajax({
      "type": "POST",
      "url": UPLOAD_URL + 'files/sandbox/' + path + '?access_token=' + this._access_token,
      "data": data
    });

  };

  /**
   * Create a document.
   *
   * @method post
   * @param  {Object} command The JIO command
   * @param  {Object} metadata The metadata to store
   */
  DropboxStorage.prototype.post = function (command, metadata) {
    // A copy of the document is made
    var doc = jIO.util.deepClone(metadata),
    doc_id = metadata._id;
    // An id is generated if none is provided
    if (!doc_id) {
      doc_id = jIO.util.generateUuid();
      doc._id = doc_id;
    }
    // The document is pushed
    return this._put(
      doc_id,
      new Blob([JSON.stringify(doc)], {
        type: "application/json"
      })
    ).then(function (doc) {
      command.success({
        "id": doc_id
      });
    }).fail(function (event) {
      command.error(
        event.target.status,
        event.target.statusText,
        "Unable to post doc"
      );
    });
  };

  /**
   * Update/create a document.
   *
   * @method put
   * @param  {Object} command The JIO command
   * @param  {Object} metadata The metadata to store
   */
  DropboxStorage.prototype.put = function (command, metadata) {
    // We put the document
    var that = this,
    old_document = {};
    return this._get(metadata._id)
      .then(function (doc) {
        if (doc.target.responseText !== undefined) {
            old_document = JSON.parse(doc.target.responseText)
          }
      })
      .fail(function (event) {
        if (event.target.status === 404) {
          return;
        }
        command.error(
          event.target.status,
          event.target.statusText,
          "Unable to put doc"
        );
      })
      .then(function () {
        if (old_document._attachments !== undefined) {
          metadata._attachments = old_document._attachments;
        }
        return that._put(
          metadata._id,
          new Blob([JSON.stringify(metadata)], {
            type: "application/json"
          })
        )
      })
      .then(function (doc) {
        command.success({
          "statusText": "No Content",
          "status": 201
        });
      })
      .fail(function (event) {
        command.error(
          event.target.status,
          event.target.statusText,
          "Unable to put doc"
        );
      });
  };

  // Storage specific get method
  DropboxStorage.prototype._get = function (key) {
    var download_url = 'https://api-content.dropbox.com/1/files/sandbox/' + key + '?access_token=' + this._access_token;
    return jIO.util.ajax({
      "type": "GET",
      "url": download_url
    });
  };

  /**
   * Get a document or attachment
   * @method get
   * @param  {object} command The JIO command
   **/
  DropboxStorage.prototype.get = function (command, param) {
    return this._get(param._id)
      .then(function (doc) {
        if (doc.target.responseText !== undefined) {
          command.success({
            "data": JSON.parse(doc.target.responseText)
          });
        } else {
          command.error(
            "not_found",
            "missing",
            "Cannot find document"
          );
        }
      }).fail(function (event) {
        command.error(
          event.target.status,
          event.target.statusText,
          "Cannot find document"
        );
      });
  };

  /**
   * Get an attachment
   *
   * @method getAttachment
   * @param  {Object} command The JIO command
   * @param  {Object} param The given parameters
   * @param  {Object} options The command options
   */
  DropboxStorage.prototype.getAttachment = function (command, param) {
    var that = this;
    // First we get the document
    return this._get(param._id)
      .then(function (answer) {
        return JSON.parse(answer.target.responseText);
      })
      .fail(function (event) {
        // If status is 404 it means the document is missing
        //   and we can not get its attachment
        if (event.target.status === 404) {
          command.error({
            'status': 404,
            'message': 'Unable to get attachment',
            'reason': 'Missing document'
          });
        } else {
          command.error(
            event.target.status,
            event.target.statusText,
            "Problem while retrieving document"
          );
        }
      }
           )
    // We get the attachment
    // XXX Should be fetch at the same time as the document for optimization
      .then(function () {
        return that._get(param._id + "-attachments/" + param._attachment);
      })
      .then(
        function (doc) {
          var attachment_blob = new Blob([doc.target.response]);
          command.success(
            doc.target.status,
            {
              "data": attachment_blob,
              "digest": jIO.util.makeBinaryStringDigest(attachment_blob)
            }
          );
        })
      .fail(function (error) {
        command.error(
          {
            'status': error.target.status,
            'reason': error.target.statusText,
            'message': "Cannot find attachment"
          }
        );
      }
           );
  };

  /**
   * Add an attachment to a document
   *
   * @method putAttachment
   * @param  {Object} command The JIO command
   * @param  {Object} param The given parameters
   * @param  {Object} options The command options
   */
  DropboxStorage.prototype.putAttachment = function (command, param) {
    var that = this,
    digest = '';
    // We calculate the digest string of the attachment
    digest = jIO.util.makeBinaryStringDigest(param._blob);
    // We first get the document
    return this._get(param._id)
      .then(function (answer) {
        return JSON.parse(answer.target.responseText);
      })
      .fail(function (event) {
        // If the document do not exist it fails
        if (event.target.status === 404) {
          command.error({
            'status': 404,
            'message': 'Impossible to add attachment',
            'reason': 'Missing document'
          });
        } else {
          command.error(
            event.target.status,
            event.target.statusText,
            "Problem while retrieving document"
          );
        }
      })
    // Once we have the document we need to update it
    //   and push the attachment
      .then(function (document) {
        var updateDocument,
        pushAttachment;
        if (document._attachments === undefined) {
          document._attachments = {};
        }
        // We update the document to include the attachment
        updateDocument = function () {
          document._attachments[param._attachment] = {
            "content_type": param._blob.type,
            "digest": digest,
            "length": param._blob.size
          };
          return that._put(
            param._id,
            new Blob([JSON.stringify(document)], {
              type: "application/json"
            })
          );
        };
        // We push the attachment
        pushAttachment = function () {
          return that._put(
            param._attachment,
            param._blob,
            param._id + '-attachments/'
          );
        };
        // Push of updated document and attachment are launched
        return RSVP.all([updateDocument(), pushAttachment()]);
      })
      .then(function (params) {
        command.success({
          'digest': digest,
          'status': 201,
          'statusText': 'Created'
        });
      })
      .fail(function (event) {
        command.error(
          event.target.status,
          event.target.statusText,
          "Unable to put attachment"
        );
      });
  };

  /**
   * Get all filenames belonging to a user from the document index
   *
   * @method allDocs
   * @param  {Object} command The JIO command
   * @param  {Object} param The given parameters
   * @param  {Object} options The command options
   */
  DropboxStorage.prototype.allDocs = function (command, param, options) {
    var list_url = '',
    result = [],
    my_storage = this;

    // Too specific, should be less storage dependent
    list_url = 'https://api.dropbox.com/1/metadata/sandbox/' + "?list=true" +
      '&access_token=' + this._access_token;

    // We get a list of all documents
    jIO.util.ajax({
      "type": "POST",
      "url": list_url
    }).then(function (response) {
      var i, item, item_id,
      data = JSON.parse(response.target.responseText),
      count = data.contents.length,
      promise_list = [];

      // We loop aver all documents
      for (i = 0; i < count; i += 1) {
        item = data.contents[i];

        // If the element is a folder it is not included (storage specific)
        if (!item.is_dir) {
          // NOTE: the '/' at the begining of the path is stripped
          item_id = item.path[0] === '/' ? item.path.substr(1) : item.path;

          // Prepare promise_list to fetch document in case of include_docs
          if (options.include_docs === true) {
            promise_list.push(my_storage._get(item_id));
          }

          // Document is added to the result list
          result.push({
            id: item_id,
            key: item_id,
            value: {}
          });
        }
      }

      // NOTE: if promise_list is empty, success is triggered directly
      // else it fetch all documents and add them to the result
      return RSVP.all(promise_list);
    }).then(function (response_list) {
      var i, response_length;

      response_length = response_list.length;
      for (i = 0; i < response_length; i += 1) {
        result[i].doc = JSON.parse(response_list[i].target.response);
      }
      command.success({
        "data": {
          "rows": result,
          "total_rows": result.length
        }
      });
    }).fail(function (error) {
      command.error(
        "error",
        "did not work as expected",
        "Unable to call allDocs"
      );
    });
  };

  // Storage specific remove method
  DropboxStorage.prototype._remove = function (key, path) {
    var DELETE_HOST = "https://api.dropbox.com/1",
    DELETE_PREFIX = "/fileops/delete/",
    DELETE_PARAMETERS,
    delete_url;
    if (path === undefined) {
      path = '';
    }
    DELETE_PARAMETERS = "?root=sandbox&path=" + path + '/' + key + "&access_token=" + this._access_token;
    delete_url = DELETE_HOST + DELETE_PREFIX + DELETE_PARAMETERS;
    return jIO.util.ajax({
      "type": "POST",
      "url": delete_url
    });
  };

  /**
   * Remove a document
   *
   * @method remove
   * @param  {Object} command The JIO command
   * @param  {Object} param The given parameters
   */
  DropboxStorage.prototype.remove = function (command, param) {
    var that = this;
    // Remove the document
    return this._remove(param._id)
      .fail(function (error) {
        // If 404 the document do not exist
        if (error.target.status === 404) {
          command.error(
            error.target.status,
            error.target.statusText,
            "Document not found"
          );
        }
        command.error(
          error.target.status,
          error.target.statusText,
          "Unable to delete document"
        );
      })
    // Remove its attachment (all in the same folder)
      .then(function (event) {
        return that._remove(param._id + '-attachments');
      })
      .then(function (event) {
        command.success(
          event.target.status,
          event.target.statusText
        );
      })
    // Even if it fails it might it is ok (no attachments)
    // XXX Should check that status is 404
    // XXX Maybe remove attachment then document or all at once !!?
      .fail(function (event) {
        command.success(
          200,
          "OK"
        );
      });
  };

  /**
   * Remove a document Attachment
   *
   * @method remove
   * @param  {Object} command The JIO command
   * @param  {Object} param The given parameters
   */
  DropboxStorage.prototype.removeAttachment = function (command, param) {
    // Remove an attachment
    // XXX Should it remove attachment occurence in the document ?
    //       Then it should be tested
    return this._remove(param._attachment, param._id + '-attachments')
      .then(function (event) {
        command.success(
          event.target.status,
          event.target.statusText,
          "Removed attachment"
        );
      })
      .fail(function (error) {
        if (error.target.status === 404) {
          command.error(
            error.target.status,
            "missing attachment",
            "Attachment not found"
          );
        }
        command.error(
          "not_found",
          "missing",
          "Unable to delete document Attachment"
        );
      });
  };

  jIO.addStorage('dropbox', DropboxStorage);
}));