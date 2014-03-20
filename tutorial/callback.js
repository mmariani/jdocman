/*jslint indent: 2, nomen: true */
/*global jIO, Blob, FileReader */

(function () {
  "use strict";

  var jio = jIO.createJIO({
    type: 'local',
    username: 'johndoe',
    application_name: 'example-' + Math.random()
  });

  function errorHandler(error) {
    console.error(error);
  }

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
        }, function (unused, response) {
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
        });
      }, errorHandler);
    }, errorHandler);
  }, errorHandler);

}());
