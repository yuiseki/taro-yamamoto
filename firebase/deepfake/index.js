/**
 * Copyright 2017, Google, Inc.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

// [START functions_imagemagick_setup]
const gm = require('gm').subClass({imageMagick: true});
const fs = require('fs');
const path = require('path');
const {Storage} = require('@google-cloud/storage');
const storage = new Storage();
const vision = require('@google-cloud/vision').v1p1beta1;
const client = new vision.ImageAnnotatorClient();
const {FAKED_BUCKET_NAME} = process.env;
// [END functions_imagemagick_setup]

// [START functions_imagemagick_analyze]
exports.fakeImages = event => {
  const object = event.data || event; // Node 6: event.data === Node 8+: event

  // Exit if this is a deletion or a deploy event.
  if (object.resourceState === 'not_exists') {
    console.log('This is a deletion event.');
    return;
  } else if (!object.name) {
    console.log('This is a deploy event.');
    return;
  }

  const file = storage.bucket(object.bucket).file(object.name);
  const filePath = `gs://${object.bucket}/${object.name}`;
  const fakeFilePath = `gs://${object.bucket}/fakeFile.png`;

  // Ignore already faked files (to prevent re-invoking this function)
  if (file.name.startsWith('faked-')) {
    console.log(`The image ${file.name} is already faked.`);
    return;
  }

  console.log(`Analyzing ${file.name}.`);
  return client
    .faceDetection(filePath)
    .catch(err => {
      console.error(`Failed to analyze ${file.name}.`, err);
      return Promise.reject(err);
    })
    .then(([results]) => {
      const detections = results[0].faceAnnotations;
      if (detections.lengt!=0){
        console.log(`The image ${file.name} contain faces.`);
        console.log(`Start Faking...`);
        return fakeImage(file, fakeFilePath, detections, RESULT_BUCKET_NAME);
      } else {
        console.log(`The image ${file.name} does not contain face.`);
      }
    });
};
// [END functions_imagemagick_analyze]

// [START functions_imagemagick_composite]
function fakeImage(file, fakeFilePath, detections, bucketName) {
  const tempLocalPath = `/tmp/${path.parse(file.name).base}`;
  // Download file from bucket.
  return file
    .download({destination: tempLocalPath})
    .catch(err => {
      console.error('Failed to download file.', err);
      return Promise.reject(err);
    })
    .then(() => {
      console.log(
        `Image ${file.name} has been downloaded to ${tempLocalPath}.`
      );
      // Fake the image using ImageMagick.
      return new Promise((resolve, reject) => {
        for (let detect in detections){
          console.log(detect);
          await new Promise((resolve, reject) => {
            let startX = detect.boundingPoly.vertices[0]['x'];
            let startY = detect.boundingPoly.vertices[0]['y'];
            let endX   = detect.boundingPoly.vertices[2]['x'];
            let endY   = detect.boundingPoly.vertices[2]['y'];
            let width  = endX - startX;
            let height = endY - startY;
            gm(tempLocalPath)
              .composite(
                gm(fakeFilePath)
                  .geometry(width+'x'+height+'+'+startX+'+'+startY)
              )
              .write(tempLocalPath, (err, stdout) => {
                if (err) {
                  console.error('Failed to fake image.', err);
                  reject(err);
                } else {
                  resolve(stdout);
                }
              });
          });
        }
      })
    })
    .then(() => {
      console.log(`Image ${file.name} has been faked.`);
      console.log(`Start Uploading...`);
      const resultBucket = storage.bucket(bucketName);
      // Upload the Faked image back into the bucket.
      return resultBucket
        .upload(tempLocalPath, {destination: file.name})
        .catch(err => {
          console.error('Failed to upload faked image.', err);
          return Promise.reject(err);
        });
    })
    .then(() => {
      console.log(
        `Faked image has been uploaded to: gs://${bucketName}/${file.name}`
      );
      // Delete the temporary file.
      return new Promise((resolve, reject) => {
        fs.unlink(tempLocalPath, err => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });
}
// [END functions_imagemagick_blur]