/**
 * Main application file. It contains the logic to:
 *
 * - Delete the PDF stored in IndexedDB and clear the ServiceWorker.
 * - Open PDF via URL or file picker and load them with PSPDFKit for Web.
 * - Manage the loaded PDF file list.
 * - Display application online status.
 */
(function() {
  /**
   * Menu to manage PDF files and load new ones.
   * ===========================================
   */

  // Online status indicator. This will show an indicator if we're online or
  // not.
  var statusContainer = document.querySelector(".OnlineStatus");
  function updateOnlineStatus() {
    statusContainer.textContent = navigator.onLine ? "online" : "offline";
    if (navigator.onLine) {
      statusContainer.textContent = "online";
      statusContainer.className = "OnlineStatus OnlineStatus--online";
    } else {
      statusContainer.textContent = "offline";
      statusContainer.className = "OnlineStatus";
    }
  }
  window.addEventListener("online", updateOnlineStatus);
  window.addEventListener("offline", updateOnlineStatus);
  updateOnlineStatus();

  /**
   * Menu: FilePicker that uses the FileReader Web API to load a PDF document as
   * ArrayBuffer from the local hard drive.
   */
  document
    .querySelector(".FilePicker-input")
    .addEventListener("change", function(event) {
      if (event.target.files.length == 0) {
        event.target.value = null;
        return;
      }
      var pdfFile = event.target.files[0];
      if (pdfFile.type !== "application/pdf") {
        alert("Invalid file type, please load a PDF.");
        return;
      }

      var reader = new FileReader();
      reader.addEventListener("load", function(event) {
        var pdf = event.target.result;
        // Save the PDF to the IndexedDB store.
        PSPDFKitFileStore.set(pdfFile.name, pdf).catch(function(e) {
          console.warn("An error occurred while saving the file. " + e.message);
        });
        window.history.pushState(
          { filename: pdfFile.name },
          null,
          window.location.pathname + "?file=" + encodeURIComponent(pdfFile.name)
        );
        load(pdf, pdfFile.name);
      });
      reader.addEventListener("error", function(error) {
        alert(error.message);
      });
      reader.readAsArrayBuffer(pdfFile);
      event.target.value = null;
    });

  /**
   * Menu: Download a remote file using a provided URL.
   */
  document
    .getElementById("Download-Remote")
    .addEventListener("click", function(event) {
      event.preventDefault();
      var url = document.querySelector(".URLPicker-input").value;
      var segments = url.split("/");
      var filename = segments[segments.length - 1];
      openPDF(filename, url);
    });

  /**
   * Clear files and (unregister) service workers controls.
   */
  document
    .querySelector(".App-clearCaches--sw")
    .addEventListener("click", function(e) {
      e.preventDefault();

      // Unregister all the Service Workers.
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker
          .getRegistrations()
          .then(function(registrations) {
            registrations.forEach(function(registration) {
              registration.unregister();
            });
          })
          .then(function() {
            alert("All service workers unregistered.");
          });
      }
    });
  document
    .querySelector(".App-clearCaches--files")
    .addEventListener("click", function(e) {
      e.preventDefault();

      // Clear the IndexedDB-based PDF store.
      PSPDFKitFileStore.listAll().then(function(files) {
        document.querySelector(".App-filesList").innerHTML = "";
        Promise.all(
          files.map(function(filename) {
            return PSPDFKitFileStore.delete(filename);
          })
        ).then(function() {
          window.history.replaceState(null, "", window.location.pathname);
        });
      });
    });

  /**
   * List stored files.
   */
  function renderFileList() {
    PSPDFKitFileStore.listAll().then(function(files) {
      files.sort();
      document.querySelector(".App-filesList").innerHTML = files
        .map(renderFileItem)
        .join("");
    });
  }
  renderFileList();

  // Simpler helper that, given a filename, generates the HTML for the files
  // manager list.
  function renderFileItem(filename) {
    var readableName = filename;
    if (/https?:\/\//.test(filename)) {
      readableName =
        "/" +
        readableName
          .split("/")
          .slice(3)
          .join("/");
    }
    return (
      '<li>\
        <a href="?file=' +
      encodeURIComponent(filename) +
      '">' +
      readableName +
      '</a>\
        <button title="Delete Document" class="Button Button-delete" data-file="' +
      btoa(filename) +
      '">×</button>\
      </li>'
    );
  }

  /**
   * We're using the history API to update the URL when selecting a document.
   */

  // Handles clicks on the file list items (also clicks to the delete button).
  document
    .querySelector(".App-filesList")
    .addEventListener("click", function(e) {
      e.preventDefault();

      var source = e.target.tagName.toLowerCase();
      var filename = null;

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
        PSPDFKitFileStore.delete(filename)
          .then(function() {
            renderFileList();
          })
          .catch(function(e) {
            alert("An error occurred while deleting the file:\n" + e.message);
          });
      }
    });

  // Handles initial load, by grabbing the file to load from the URL when
  // defined. If none is defined, it will add the example PDF from the  src/
  // folder.
  //
  // Example: /?file=Example.pdf
  window.addEventListener("load", function() {
    var filename = window.location.search.match(/file=([^&#]+)/i);
    var url;
    if (!filename || filename.length < 2) {
      url = "./assets/Example.pdf";
      filename = "Example.pdf";
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
  window.addEventListener("popstate", function(e) {
    var filename = ((e.state || {}).filename || "").trim();
    if (filename) {
      openPDF(filename);
    }
  });

  /**
   * openPDF, load and unload helpers.
   */

  /**
   * Given a filename and an optional URL, we try to open it from the local
   * PSPDFKitFileStore first.
   * If the file is not found, we then tries to fetch it from the network using
   * the URL and and store the file locally.
   */
  function openPDF(filename, url) {
    // Try to get the file from the IndexedDB store.
    PSPDFKitFileStore.get(filename)
      .then(function(file) {
        // The store returns `undefined` when it cannot find a file.
        if (file == null) {
          throw new Error(filename + " not found");
        }

        // If the file is found we load it.
        console.log("Opening " + filename + " from local PSPDFKitFileStore.");
        load(file, filename);
      })
      .catch(function(error) {
        // We only try to load the file from network if a URL is provided.
        if (!url) {
          throw error;
        }

        // We attempt to download it from network
        console.log("Fetching " + filename + " from network. (" + url + ")");
        return fetch(url)
          .then(function(response) {
            if (response.status === 200 || response.status === 304) {
              return response.arrayBuffer();
            }

            // 404 or other errors.
            throw new Error(response.status + " " + response.statusText);
          })
          .then(function(file) {
            // Save file if fetching succeeded.
            PSPDFKitFileStore.set(filename, file).catch(function(error) {
              console.warn(
                "An error occurred while saving the file:\n" + error.message
              );
            });

            // Load file.
            load(file, filename);
          })
          .catch(function(error) {
            console.error(error);
            alert(
              "An error occurred while fetching the file:\n" + error.message
            );
          });
      })
      .catch(function(error) {
        console.error(error);
        alert("An error occurred while fetching the file:\n" + error.message);
      });
  }

  /**
   * Loads a pdf in ArrayBuffer format. Also make sure that any existing
   * instance is unloaded first, and any previous loading operation is complete.
   */

  // Keep track of the current load promise.
  var loadPromise = Promise.resolve();
  // Keep a reference to the PSPDFKit instance.
  var pspdfkitInstance = null;
  // We want to fetch the license only once so we requesting it for the first time
  // we save the promise returned by fetch("./config/license-key")
  var licenseKeyPromise = null;
  // Keep track of unsaved changes so that we can ask to save before unloading an instance.
  var hasUnsavedChanges = false;

  // Given a pdf in ArrayBuffer format loads it with PSPDFKit for Web.
  function load(pdf, filename) {
    // We wait for any potential ongoing PDF loading.
    loadPromise.then(function() {
      // Unload an existing pdf if any.
      var unloadPromise = pspdfkitInstance ? unload() : Promise.resolve();

      unloadPromise.then(function() {
        // Fetch the PSPDFKit for Web license.
        if (!licenseKeyPromise) {
          licenseKeyPromise = fetch("./config/license-key")
            .then(function(r) {
              return r.text();
            })
            .catch(function(e) {
              licenseKeyPromise = null;
              console.error(e);
            });
        }

        // Once we have the license key we can finally load PSPDFKit.
        licenseKeyPromise.then(function(licenseKey) {
          // Add a custom button to download the PDF to the toolbar.
          var exportButton = {
            type: "custom",
            id: "export-pdf",
            title: "Export",
            icon: "./images/download.svg",
            onPress: function() {
              pspdfkitInstance.exportPDF().then(function(buffer) {
                const supportsDownloadAttribute = HTMLAnchorElement.prototype.hasOwnProperty(
                  "download"
                );
                const blob = new Blob([buffer], { type: "application/pdf" });
                if (navigator.msSaveOrOpenBlob) {
                  navigator.msSaveOrOpenBlob(blob, "download.pdf");
                } else if (!supportsDownloadAttribute) {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    const dataUrl = reader.result;
                    downloadPdf(dataUrl);
                  };

                  reader.readAsDataURL(blob);
                } else {
                  const objectUrl = window.URL.createObjectURL(blob);
                  downloadPdf(objectUrl);
                  window.URL.revokeObjectURL(objectUrl);
                }
              });
            }
          };
          var toolbarItems = PSPDFKit.defaultToolbarItems.concat([
            exportButton
          ]);

          loadPromise = PSPDFKit.load({
            container: document.querySelector(".Viewer"),
            pdf: pdf,
            licenseKey: licenseKey,
            disableWebAssembly: shouldDisableWebAssembly(),
            toolbarItems: toolbarItems,
            // We need to enable this to store the stylesheets loaded by PSPDFKit for Web in the
            // localStorage, otherwise those requests would be bypassed.
            enableServiceWorkerSupport: true
          })
            .then(function(instance) {
              hasUnsavedChanges = false;

              // Re-render the files list
              renderFileList();

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
            })
            .catch(function(e) {
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
  var html = document.querySelector("html");
  var sidebar = document.querySelector(".App-Sidebar");
  var sidebarLinks = document.querySelectorAll(".App-Sidebar a");
  var sidebarToggleButton = document.getElementById("sidebar-toggle");

  function showSidebar() {
    html.classList.remove("sidebar-hidden");
    html.classList.add("sidebar-visible");
    Array.from(sidebarLinks).forEach(function(link) {
      link.setAttribute("tabIndex", 0);
    });
    sidebarToggleButton.setAttribute("aria-expanded", true);
    sidebar.setAttribute("aria-hidden", false);
  }

  function hideSidebar() {
    html.classList.remove("sidebar-visible");
    html.classList.add("sidebar-hidden");
    Array.from(sidebarLinks).forEach(function(link) {
      link.setAttribute("tabIndex", -1);
    });
    sidebarToggleButton.setAttribute("aria-expanded", false);
    sidebar.setAttribute("aria-hidden", true);
  }

  sidebarToggleButton.addEventListener("click", function() {
    if (html.classList.contains("sidebar-hidden")) {
      showSidebar();
    } else {
      hideSidebar();
    }
  });

  // Apply ARIA attributes for the default sidebar state
  var isSidebarVisible = sidebar.classList.contains("sidebar-visible");
  sidebarToggleButton.setAttribute("aria-expanded", isSidebarVisible);
  sidebar.setAttribute("aria-hidden", !isSidebarVisible);
  Array.from(document.querySelectorAll("#sidebar a")).forEach(function(link) {
    link.setAttribute("tabIndex", isSidebarVisible ? 0 : -1);
  });

  /**
   * Little helper to monitor changes to annotations and form fields.
   */
  function createOnChange() {
    var initialized = false;
    return function() {
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
   *     PSPDFKitFileStore.set(filename, file)
   *
   * After this operation calls PSPDFKit.unload(pspdfkitInstance) to unload the
   * current instance.
   */
  function unload() {
    if (!pspdfkitInstance) {
      return;
    }

    console.log("unload", pspdfkitInstance.filename);
    var filename = pspdfkitInstance.filename;

    // If there are no changes `unsavedChangesPromise` will resolve immediately.
    var unsavedChangesPromise = Promise.resolve();

    // In case there are unsaved changes, try to save the PDF to PSPDFKitFileStore.
    if (
      hasUnsavedChanges &&
      window.confirm(
        "You have unsaved changes. Do you want to save the document?"
      )
    ) {
      unsavedChangesPromise = new Promise(function(resolve) {
        // We use PSPDFKit's Instance#exportPDF() method to export the PDF to
        // an ArrayBuffer.
        pspdfkitInstance
          .exportPDF()
          .then(function(file) {
            console.log("Saving exported PDF as " + filename);
            // Once we have the PDF file in ArrayBuffer we store it inside our
            // s.
            PSPDFKitFileStore.set(filename, file)
              .then(function() {
                console.log("PDF saved!");
                resolve();
              })
              .catch(function(e) {
                console.log(
                  "An error occurred while saving the PDF. " + e.message
                );
                resolve();
              });
          })
          .catch(function(e) {
            console.log(
              "An error occurred while exporting the PDF. " + e.message
            );
            resolve();
          });
      });
    }

    return unsavedChangesPromise.then(function() {
      PSPDFKit.unload(pspdfkitInstance);
      window.pspdfkitInstance = pspdfkitInstance = null;
      hasUnsavedChanges = false;
    });
  }

  // We don't want to use WASM on mobile devices because of performance issues
  // with the latest Safari and Chrome mobile browsers.
  // iOS 11.3 and 11.4 seem to not work properly with our JavaScript build though
  // therefore we force WASM for those versions until the issue is resolved.
  //
  // This can like be removed in the future.
  //
  // @see https://pspdfkit.com/blog/2018/a-real-world-webassembly-benchmark/
  function shouldDisableWebAssembly() {
    var userAgent = navigator.userAgent;
    if (/windows phone/i.test(userAgent)) {
      return true;
    }
    if (/android/i.test(userAgent)) {
      return true;
    }
    if (/iPad|iPhone|iPod/.test(userAgent) && !/11_(3|4)/.test(userAgent)) {
      return true;
    }
    return false;
  }
})();

function downloadPdf(blob) {
  const a = document.createElement("a");
  a.href = blob;
  a.style.display = "none";
  a.download = "download.pdf";
  a.setAttribute("download", "download.pdf");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
