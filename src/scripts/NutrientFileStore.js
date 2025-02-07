/**
 * NutrientFileStore is a general purpose IndexedDB storage that can be used for
 * storing your PDFs offline.
 *
 * In the PWA example, we use it to allow documents to be downloaded and be
 * available even if you restart the application.
 */
(function () {
  window.indexedDB =
    window.indexedDB ||
    window.webkitIndexedDB ||
    window.mozIndexedDB ||
    window.OIndexedDB ||
    window.msIndexedDB;

  var NOT_SUPPORTED_ERROR_MESSAGE =
    "Nutrient File Store works only in browsers that support IndexedDB";

  function notSupported() {
    return Promise.reject(new Error(NOT_SUPPORTED_ERROR_MESSAGE));
  }

  if (!window.indexedDB) {
    console.warn(NOT_SUPPORTED_ERROR_MESSAGE);
    window.NutrientFileStore = {
      get: notSupported,
      set: notSupported,
      delete: notSupported,
      clear: notSupported,
      listAll: notSupported,
    };
    return;
  }

  var STORE_NAME = "NUTRIENT_FILES_STORE";
  var STORE_VERSION = 1;

  var dbPromise = idb.open(STORE_NAME, STORE_VERSION, function (upgradeDB) {
    upgradeDB.createObjectStore(STORE_NAME);
  });

  window.NutrientFileStore = {
    /**
     * Retrieve the contents of a file stored in the NutrientFileStore.
     *
     * @param {string} filename
     */
    get: function (filename) {
      return dbPromise.then(function (db) {
        return db.transaction(STORE_NAME).objectStore(STORE_NAME).get(filename);
      });
    },

    /**
     * Persists a file in the NutrientFileStore. A file is referenced by its
     * filename.
     *
     * @param {string} filename
     * @param {ArrayBuffer} pdfBuffer
     * @param {ArrayBuffer} thumbnailData
     */
    set: function (filename, pdfBuffer, thumbnailData) {
      return dbPromise.then(function (db) {
        var tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(
          {
            pdfBuffer: pdfBuffer,
            thumbnailData: thumbnailData,
          },
          filename
        );
        return tx.complete;
      });
    },

    /**
     * Deletes a file in the NutrientFileStore.
     *
     * @param {string} filename
     */
    delete: function (filename) {
      return dbPromise.then(function (db) {
        var tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(filename);
        return tx.complete;
      });
    },

    /**
     * Resets the NutrientFileStore. After that, every file will be deleted.
     *
     * @returns {Promise}
     */
    clear: function () {
      return dbPromise.then(function (db) {
        var tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).clear();
        return tx.complete;
      });
    },

    /**
     * Returns a promise that resolves to all files that are currently stored
     * in the NutrientFileStore.
     *
     * @returns {Array<string>}
     */
    listAll: function () {
      return dbPromise.then(function (db) {
        var tx = db.transaction(STORE_NAME);
        var files = [];
        var store = tx.objectStore(STORE_NAME);

        // This could use `getAllKeys()`, but isn't supported in some browsers.
        // `iterateKeyCursor` is also not supported by Safari.
        (store.iterateKeyCursor || store.iterateCursor).call(
          store,
          function (cursor) {
            if (!cursor) return;
            files.push(cursor.key);
            cursor.continue();
          }
        );

        return tx.complete.then(function () {
          return files;
        });
      });
    },
  };
})();
