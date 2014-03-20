/*jslint indent: 2, nomen: true */
/*global jIO, Blob, FileReader */

(function () {
  "use strict";

  var jio = jIO.createJIO({
    type: 'local',
    username: 'johndoe',
    application_name: 'example-' + Math.random()
  });

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


}());
