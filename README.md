# PSPDFKit for Web Example - PWA

This example shows how to integrate [PSPDFKit for Web](https://pspdfkit.com/web/) and create a PWA (Progressive Web App).

You can check out a live preview here: [pspdfkit.com/pwa](https://pspdfkit.com/pwa/).

This sample application features a basic PWA setup including a [manifest](src/manifest.js) and a [service worker](src/serviceWorker.js), to allow your app to function offline as well as an [IndexedDB storage](src/scripts/PSPDFKitFileStorage.js) for PDFs. This way, your files are persisted even after you close the browser.

In this example we use [workbox](https://github.com/GoogleChrome/workbox), a popular PWA framework by Google.

## Prerequisites

- [Node.js](http://nodejs.org/)
- A PSPDFKit for Web license. If you don't already have one you can [request a free trial here](https://pspdfkit.com/try/).

## Getting Started

Clone the repo:

```bash
git clone https://github.com/PSPDFKit/pspdfkit-electron-example.git
cd pspdfkit-electron-example
```

Install the project dependencies with `npm`:

```bash
npm install
```

Now that everything is installed we need to configure the app to use our [PSPDFKit for Web license key](https://pspdfkit.com/guides/web/current/standalone/integration).

Edit `./config/license-key` and replace the string `YOUR_LICENSE_KEY_GOES_HERE` with the license key that you received via e-mail.

## Running the Example

We are ready to launch the app! 🎉

To run the app in development mode:

```bash
npm run start
```

## Build Production Artifacts

To build a production version, just follow the above guide but instead of running `start`:

```bash
npm run build
```

The build script will then create a file called `./dist` which you can copy to your webserver as-is.

## How it works

Under `./src` you can find a simple application shell that loads PSPDFKit for Web.

The application uses a [service worker](src/serviceWorker.js) to provide offline support and pre-caching for the majority of the assets.

To reduce the amount of boilerplate, we use [workbox](https://github.com/GoogleChrome/workbox) - a library from Google that abstracts away some of the verbosity associated to the service worker creation and configuration.

We also use workbox-cli, another library from Google, to automatically generate a Manifest file for our ServiceWorker pre-cache when we run `npm start`. You can find this configuration file in [`./src/workbox-config.js`](src/workbox-config.js).

To allow PDFs to be persisted locally so they do not need to be downloaded again, we've created the [`PSPDFKitFileStore`](src/scripts/PSPDFKitFileStore.js) library. It uses a lightweight and `Promise`-based wrapper around the IndexedDB API called [`idb`](https://github.com/jakearchibald/idb) under the hood. The code is designed to work independently of the PWA example and can also be used in Internet Explorer 11.

## Mobile Support

If you try to connect to the local development server remotely you'll quickly see that the PWA is not working as expected. This is due to the fact that the PWA APIs [require a valid SSL/TLS certificate](https://developers.google.com/web/progressive-web-apps/checklist) to properly function and you will probably not have this setup locally.

For a better experience, we suggest you check out the [hosted PWA example](https://pspdfkit.com/pwa/) or deploy a production build to your own server.

## License

This software is licensed under a [modified BSD license](LICENSE).

## Contributing

Please ensure [you have signed our CLA](https://pspdfkit.com/guides/web/current/miscellaneous/contributing/) so that we can accept your contributions.
