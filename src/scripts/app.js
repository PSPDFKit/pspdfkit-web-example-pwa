// @ts-check

/**
 * Main application file. It contains the logic to:
 *
 * - Delete the PDF stored in IndexedDB and clear the ServiceWorker.
 * - Open PDF via URL or file picker and load them with Nutrient Web SDK.
 * - Manage the loaded PDF file list.
 * - Display application online status.
 */
(function () {
  /**
   * @param {string} selector
   * @returns {Element | null}
   */
  function $(selector) {
    return document.querySelector(selector);
  }

  /**
   * @param {string} selector
   * @returns {NodeListOf<Element>}
   */
  function $$(selector) {
    return document.querySelectorAll(selector);
  }

  const thumbnailRenderedWidth = 160;

  /**
   * Menu to manage PDF files and load new ones.
   * ===========================================
   */

  // Online status indicator. This will show an indicator if we're online or
  // not.
  const statusContainer = $("#online-status");

  function updateOnlineStatus() {
    statusContainer.textContent = navigator.onLine ? "online" : "offline";

    if (navigator.onLine) {
      statusContainer.textContent = "online";
      statusContainer.className = "online-status online-status--online";
    } else {
      statusContainer.textContent = "offline";
      statusContainer.className = "online-status";
    }
  }

  window.addEventListener("online", updateOnlineStatus);
  window.addEventListener("offline", updateOnlineStatus);
  updateOnlineStatus();

  /**
   * Menu: FilePicker that uses the FileReader Web API to load a PDF document as
   * ArrayBuffer from the local hard drive.
   */
  $("#file-picker-input").addEventListener("change", function (event) {
    if (event.target.files.length == 0) {
      event.target.value = null;

      return;
    }

    const pdfFile = event.target.files[0];

    if (
      pdfFile.type !== "application/pdf" &&
      // Looks like IE11 doesn't set the type
      !(pdfFile.type === "" && pdfFile.name.endsWith(".pdf"))
    ) {
      alert("Invalid file type, please load a PDF.");

      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", function (event) {
      const pdfBuffer = event.target.result;
      window.history.pushState(
        { filename: pdfFile.name },
        null,
        window.location.pathname + "?file=" + encodeURIComponent(pdfFile.name)
      );

      loadArrayBuffer(pdfBuffer, pdfFile.name);
    });

    reader.addEventListener("error", function (error) {
      alert(error.message);
    });

    reader.readAsArrayBuffer(pdfFile);
    event.target.value = null;
  });

  $("#hide-sidebar").addEventListener("click", hideSidebar);

  /**
   * Menu: Download a remote file using a provided URL.
   */
  $("#download-remote").addEventListener("click", function (event) {
    event.preventDefault();
    const url = $("#url-picker-input").value;
    const segments = url.split("/");
    const filename = segments[segments.length - 1];
    openPDF(filename, url);
  });

  /**
   * Clear files and (unregister) service workers controls.
   */
  $("#clear-service-worker").addEventListener("click", function (e) {
    e.preventDefault();

    // Unregister all the Service Workers.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then(function (registrations) {
          registrations.forEach(function (registration) {
            registration.unregister();
          });
        })
        .then(function () {
          alert("All service workers unregistered.");
        });
    }
  });

  $("#delete-files").addEventListener("click", function (e) {
    e.preventDefault();

    // Clear the IndexedDB-based PDF store.
    NutrientFileStore.listAll().then(function (files) {
      $("#files-list").innerHTML = "";
      Promise.all(
        files.map(function (filename) {
          return NutrientFileStore.delete(filename);
        })
      ).then(function () {
        window.history.replaceState(null, "", window.location.pathname);
      });
    });
  });

  /**
   * List stored files.
   */
  function renderFileList() {
    const filesList = $("#files-list");
    filesList.innerHTML = "";

    let filenames;
    NutrientFileStore.listAll()
      .then(function (result) {
        filenames = result;
        filenames.sort();

        return Promise.all(
          filenames.map(function (filename) {
            return NutrientFileStore.get(filename);
          })
        );
      })
      .then(function (files) {
        return files.map(function (file, index) {
          return [filenames[index], file];
        });
      })
      .then(function (filenameFiles) {
        return filenameFiles.map(function (filenameFile) {
          return renderFileItem(filenameFile[0], filenameFile[1]);
        });
      })
      .then(function (renderedItems) {
        renderedItems.forEach(function (item) {
          filesList.appendChild(item);
        });
      });
  }

  renderFileList();

  // Simpler helper that, given a filename, generates the HTML for the files
  // manager list.
  function renderFileItem(filename, file) {
    const fileEntry = document.createElement("div");
    fileEntry.classList.add("files-list__file");

    const thumbnailData = file.thumbnailData;

    const anchor = document.createElement("a");
    anchor.classList.add("files-list__file-anchor");
    anchor.href = "?file=" + encodeURIComponent(filename);

    const pageWidth = thumbnailData.width;
    const pageHeight = thumbnailData.height;
    const width = thumbnailRenderedWidth;
    const height = Math.round((width * pageHeight) / pageWidth);

    const canvas = document.createElement("canvas");
    canvas.classList.add("files-list__file-thumbnail");
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = width / 2 + "px";
    canvas.style.height = height / 2 + "px";
    const imageView = new Uint8Array(thumbnailData.buffer);
    const ctx = canvas.getContext("2d");
    const imageData = ctx.createImageData(width, height);
    imageData.data.set(imageView);
    ctx.putImageData(imageData, 0, 0);

    anchor.appendChild(canvas);

    const removeButton = document.createElement("button");
    removeButton.classList.add("files-list__file-remove");
    removeButton.textContent = "✕";
    removeButton.dataset.file = btoa(filename);

    anchor.appendChild(removeButton);

    const label = document.createElement("span");
    label.classList.add("files-list__file-label");
    let readableName = filename;

    if (/https?:\/\//.test(filename)) {
      readableName = "/" + readableName.split("/").slice(3).join("/");
    }

    label.textContent = readableName;

    fileEntry.appendChild(anchor);
    fileEntry.appendChild(label);

    return fileEntry;
  }

  /**
   * We're using the history API to update the URL when selecting a document.
   */

  // Handles clicks on the file list items (also clicks to the delete button).
  $(".files-list").addEventListener("click", function (e) {
    e.preventDefault();

    const source = e.target.tagName.toLowerCase();
    let filename = null;

    // Open a document.
    if (source === "a") {
      filename = decodeURIComponent(e.target.href.split("=")[1]);
      window.history.pushState({ filename: filename }, "", e.target.href);
      openPDF(filename);
    }

    // Delete a document.
    if (source === "button") {
      filename = atob(e.target.dataset.file);

      // Remove the file from the store.
      NutrientFileStore.delete(filename)
        .then(function () {
          renderFileList();
        })
        .catch(function (e) {
          alert("An error occurred while deleting the file:\n" + e.message);
        });
    }
  });

  // Handles initial load, by grabbing the file to load from the URL when
  // defined. If none is defined, it will add the example PDF from the  src/
  // folder.
  //
  // Example: /?file=example.pdf
  window.addEventListener("load", function () {
    let filename = window.location.search.match(/file=([^&#]+)/i);
    let url;

    if (!filename || filename.length < 2) {
      url = "./assets/example.pdf";
      filename = "example.pdf";
    } else {
      filename = url = decodeURIComponent(filename[1]);
    }

    window.history.replaceState(
      { filename: filename },
      "",
      window.location.pathname + window.location.search
    );

    openPDF(filename, url);
  });

  // Handles URL changes.
  window.addEventListener("popstate", function (e) {
    const filename = ((e.state || {}).filename || "").trim();

    if (filename) {
      openPDF(filename);
    }
  });

  /**
   * openPDF, load and unload helpers.
   */

  /**
   * Given a filename and an optional URL, we try to open it from the local
   * NutrientFileStore first.
   * If the file is not found, we then tries to fetch it from the network using
   * the URL and and store the file locally.
   *
   * @param {string} filename
   * @param {string} url
   */
  function openPDF(filename, url) {
    // Try to get the file from the IndexedDB store.
    NutrientFileStore.get(filename)
      .then(function (file) {
        const pdfBuffer = file.pdfBuffer;

        // The store returns `undefined` when it cannot find a file.
        if (pdfBuffer == null) {
          throw new Error(filename + " not found");
        }

        // If the file is found we load it.
        console.log("Opening " + filename + " from local store.");
        loadArrayBuffer(pdfBuffer, filename, false);
      })
      .catch(function (error) {
        // We only try to load the file from network if a URL is provided.
        if (!url) {
          throw error;
        }

        // We attempt to download it from network
        console.log("Fetching " + filename + " from network. (" + url + ")");

        return fetch(url)
          .then(function (response) {
            if (response.status === 200 || response.status === 304) {
              return response.arrayBuffer();
            }

            // 404 or other errors.
            throw new Error(response.status + " " + response.statusText);
          })
          .then(function (pdfBuffer) {
            //SAVE
            loadArrayBuffer(pdfBuffer, filename);
          })
          .catch(function (error) {
            console.error(error);
            alert(
              "An error occurred while fetching the file:\n" + error.message
            );
          });
      })
      .catch(function (error) {
        console.error(error);
        alert("An error occurred while fetching the file:\n" + error.message);
      });
  }

  /**
   * Loads a pdf in ArrayBuffer format. Also make sure that any existing
   * instance is unloaded first, and any previous loading operation is complete.
   */

  // Keep track of the current load promise.
  let loadPromise = Promise.resolve();
  // Keep a reference to the PSPDFKit instance.
  let pspdfkitInstance = null;
  // We want to fetch the license only once so we requesting it for the first time
  // we save the promise returned by fetch("./config/license-key")
  let licenseKeyPromise = null;
  // Keep track of unsaved changes so that we can ask to save before unloading an instance.
  let hasUnsavedChanges = false;

  /**
   * Loads a PDF ArrayBuffer using Nutrient Web SDK.
   *
   * @param {ArrayBuffer} pdfBuffer
   * @param {string} filename
   */
  function loadArrayBuffer(pdfBuffer, filename, storeLocally) {
    if (storeLocally === undefined) {
      storeLocally = true;
    }

    const pdfBufferCopy = pdfBuffer.slice(0);

    // We wait for any potential ongoing PDF loading.
    loadPromise.then(function () {
      // Unload an existing pdf if any.
      const unloadPromise = pspdfkitInstance ? unload() : Promise.resolve();

      unloadPromise.then(function () {
        // Fetch the Nutrient Web SDK license.
        if (!licenseKeyPromise) {
          licenseKeyPromise = fetch("./config/license-key")
            .then(function (response) {
              return response.text();
            })
            .catch(function (error) {
              licenseKeyPromise = null;
              console.error(error);
            });
        }

        // Once we have the license key we can finally load PSPDFKit.
        licenseKeyPromise.then(function (licenseKey) {
          loadPromise = PSPDFKit.load({
            container: $("#pspdf-container"),
            document: pdfBuffer,
            licenseKey: licenseKey.trim().length > 0 ? licenseKey : null,
            // We need to enable this to store the stylesheets loaded by Nutrient Web SDK in the
            // localStorage, otherwise those requests would be bypassed.
            toolbarItems: PSPDFKit.defaultToolbarItems.concat([
              { type: "cloudy-rectangle", dropdownGroup: "shapes" },
              { type: "dashed-rectangle", dropdownGroup: "shapes" },
              { type: "cloudy-ellipse", dropdownGroup: "shapes" },
              { type: "dashed-ellipse", dropdownGroup: "shapes" },
              { type: "dashed-polygon", dropdownGroup: "shapes" },
              { type: "content-editor", dropdownGroup: "editor" },
              { type: "form-creator", dropdownGroup: "editor" },
              { type: "measure", dropdownGroup: "editor" },
              { type: "document-comparison", dropdownGroup: "editor" },
            ]),
            enableServiceWorkerSupport: true,
          })
            .then(function (instance) {
              hasUnsavedChanges = false;

              // We store the current filename with the instance so we can
              // save to the proper file when unloading.
              instance.filename = filename;

              // Monitor changes to the document so that we can prompt to save before unloading.
              instance.addEventListener("annotations.change", createOnChange());
              instance.addEventListener(
                "formFieldValues.update",
                createOnChange()
              );

              window.pspdfkitInstance = pspdfkitInstance = instance;

              if (storeLocally) {
                const pageInfo = instance.pageInfoForIndex(0);

                return instance
                  .renderPageAsArrayBuffer({ width: thumbnailRenderedWidth }, 0)
                  .then(function (thumbnailBuffer) {
                    // Save the PDF to the IndexedDB store.
                    NutrientFileStore.set(filename, pdfBufferCopy, {
                      width: pageInfo.width,
                      height: pageInfo.height,
                      buffer: thumbnailBuffer,
                    }).catch(function (error) {
                      console.warn(
                        "An error occurred while saving the file. " +
                          error.message
                      );
                    });
                  })
                  .then(function () {
                    // Re-render the files list
                    renderFileList();
                  });
              }
            })
            .catch(function (e) {
              console.error(e);
              pspdfkitInstance = null;
              hasUnsavedChanges = false;
            });
        });
      });
    });
  }

  /**
   * Sidebar logic
   */
  const html = $("html");
  const sidebar = $(".sidebar");
  const sidebarLinks = $$(".sidebar a");
  const sidebarToggleButton = document.getElementById("sidebar-toggle");

  function showSidebar() {
    html.classList.add("root--sidebar-visible");
    localStorage.setItem("sidebarVisible", true);
    Array.from(sidebarLinks).forEach(function (link) {
      link.setAttribute("tabIndex", 0);
    });
    sidebarToggleButton.setAttribute("aria-expanded", true);
    sidebar.setAttribute("aria-hidden", false);
  }

  function hideSidebar() {
    html.classList.remove("root--sidebar-visible");
    localStorage.setItem("sidebarVisible", false);
    Array.from(sidebarLinks).forEach(function (link) {
      link.setAttribute("tabIndex", -1);
    });
    sidebarToggleButton.setAttribute("aria-expanded", false);
    sidebar.setAttribute("aria-hidden", true);
  }

  sidebarToggleButton.addEventListener("click", function () {
    if (html.classList.contains("root--sidebar-visible")) {
      hideSidebar();
    } else {
      showSidebar();
    }
  });

  // Apply ARIA attributes for the default sidebar state
  const isSidebarVisible = sidebar.classList.contains("root--sidebar-visible");
  sidebarToggleButton.setAttribute("aria-expanded", isSidebarVisible);
  sidebar.setAttribute("aria-hidden", !isSidebarVisible);
  Array.from($$("#sidebar a")).forEach(function (link) {
    link.setAttribute("tabIndex", isSidebarVisible ? 0 : -1);
  });

  /**
   * Drag and drop files
   */
  const dndArea = $("#dnd-area");
  dndArea.addEventListener("dragover", function (event) {
    dndArea.classList.add("dnd-area--engaged");
    event.preventDefault();
  });

  function handleDragExit() {
    dndArea.classList.remove("dnd-area--engaged");
  }

  dndArea.addEventListener("dragexit", handleDragExit);
  dndArea.addEventListener("dragleave", handleDragExit);

  dndArea.addEventListener(
    "drop",

    /**
     * @param {DragEvent} event
     */
    function (event) {
      dndArea.classList.remove("dnd-area--engaged");

      event.preventDefault();

      const files = event.dataTransfer.files;

      if (files.length === 0) {
        console.log("No files uploaded.");

        return;
      }

      const file = files[0];

      if (file.type !== "application/pdf") {
        console.log(
          "File type must be application/pdf. (got " + file.type + ")"
        );

        return;
      }

      console.log("Got valid file", file);

      const reader = new FileReader();
      reader.addEventListener("load", function (event) {
        const pdfBuffer = event.target.result;

        window.history.pushState(
          { filename: file.name },
          null,
          window.location.pathname + "?file=" + encodeURIComponent(file.name)
        );

        loadArrayBuffer(pdfBuffer, file.name);
      });

      reader.readAsArrayBuffer(file);
    }
  );

  /**
   * Little helper to monitor changes to annotations and form fields.
   */
  function createOnChange() {
    let initialized = false;

    return function () {
      if (initialized) {
        hasUnsavedChanges = true;
      } else {
        initialized = true;
      }
    };
  }

  /**
   * Unload helper.
   *
   * Checks whether there are unsaved changes before unloading PSPDFKit.
   * When that's the case it saves the PDF to the IndexedDB store in two steps:
   *
   *  1. Uses the Instance#exportPDF() to export the current version of the PDF
   *     to ArrayBuffer.
   *  2. Tries to save this PDF as ArrayBuffer in IndexedDB with
   *     NutrientFileStore.set(filename, file)
   *
   * After this operation calls PSPDFKit.unload(pspdfkitInstance) to unload the
   * current instance.
   */
  function unload() {
    if (!pspdfkitInstance) {
      return;
    }

    console.log("unload", pspdfkitInstance.filename);
    const filename = pspdfkitInstance.filename;

    // If there are no changes `unsavedChangesPromise` will resolve immediately.
    let unsavedChangesPromise = Promise.resolve();

    // In case there are unsaved changes, try to save the PDF to the store.
    if (
      hasUnsavedChanges &&
      window.confirm(
        "You have unsaved changes. Do you want to save the document?"
      )
    ) {
      unsavedChangesPromise = new Promise(function (resolve) {
        // We use PSPDFKit's Instance#exportPDF() method to export the PDF to
        // an ArrayBuffer.
        Promise.all([
          pspdfkitInstance.exportPDF(),
          pspdfkitInstance.renderPageAsArrayBuffer(
            { width: thumbnailRenderedWidth },
            0
          ),
        ])
          .then(function (results) {
            const pdfBuffer = results[0];
            const thumbnailBuffer = results[1];
            const pageInfo = pspdfkitInstance.pageInfoForIndex(0);

            console.log("Saving exported PDF as " + filename);
            NutrientFileStore.set(filename, pdfBuffer, {
              width: pageInfo.width,
              height: pageInfo.height,
              buffer: thumbnailBuffer,
            })
              .then(function () {
                console.log("PDF saved!");
                resolve();
              })
              .catch(function (e) {
                console.log(
                  "An error occurred while saving the PDF. " + e.message
                );
                resolve();
              });
          })
          .catch(function (e) {
            console.log(
              "An error occurred while exporting the PDF. " + e.message
            );
            resolve();
          });
      });
    }

    return unsavedChangesPromise.then(function () {
      PSPDFKit.unload(pspdfkitInstance);
      window.pspdfkitInstance = pspdfkitInstance = null;
      hasUnsavedChanges = false;
    });
  }
})();
