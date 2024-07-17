# VirES for Swarm web client

The VirES for Swarm we blint focuses on creating a webclient for map applications, which allows easy customization through a centralized configuration concept.

## Technologies used

The application uses [Yeoman](http://yeoman.io/) which integrates:

* [Yo](https://github.com/yeoman/yo) : scaffolds out the application, writing the Grunt configuration and pulling in relevant Grunt tasks that you might need for your build.
* [Grunt](http://gruntjs.com/) : which allows building, previewing and testing the project

## Libraries used

* [require](http://requirejs.org/)
* [Underscore](http://underscorejs.org/)
* [jQuery](http://jquery.com/)
* [Backbone](http://backbonejs.org/)
* [Backbone Marionette](http://marionettejs.com/)

## How to setup development environmet (on a Linux machine)

0.  Get the code from GitHub [VirES for Swarm web client repository](https://github.com/ESA-VirES/WebClient-Framework):

    ```
    git clone git@github.com:ESA-VirES/WebClient-Framework.git
    ```

0.  Install development environment and client dependencies:

    Make sure [Node.js](http://nodejs.org) >= 14 and [NPM](https://npmjs.org) are installed
    on your machine and run:

    ```
    cd ./EOxClient
    npm install
    ```

    These commands install the needed Node.js packages.

    You will also need ruby and ruby-compass installed to run the dev server due to the usage of compass for sass preprocessing.

    Install them on linux by:

    apt install -y ruby ruby-compass

0.  Grunt proxy configuration

    Copy `Gruntfile.js.template` to `Gruntfile.js`.

    ```
    cp Gruntfile.js.template Gruntfile.js
    ```

    If you intend to run the development server, you will also need to edit
    the `Gruntfile.js` file and configure the VirES server proxy.
    Namely, the hostname and protocol (HTTP or HTTPS) of the VireES server
    and [access token](https://viresclient.readthedocs.io/en/latest/access_token.html)
    need to be filled.

    ```
    ...
    proxies: [{
        context: '/wps',
        host: 'vires.services',
        https: true,
        secure: false,
    }, {
        context: '/ows',
        host: 'vires.services',
        headers: {
            "Authorization": "Bearer <put-your-access-token-here>"
        },
        https: true,
        secure: false,
    }, {
        context: '/custom_data',
        host: 'vires.services',
        headers: {
            "Authorization": "Bearer <put-your-access-token-here>"
        },
        https: true,
        secure: false,
    }],
    ...
    ```

0.  Start the [Grunt](http://gruntjs.com/) development server:

    ```
    npm run start
    ```

    this should automatically open a the client on your default web browser, if not point your browser to localhost:9000.

    If you managed to reach this the last step you can start to hack the code.
    The development server by grunt watches for saved changes in the code and will update the page automatically.


## How to deploy the code on a server

0.  Create deployment package:

    ```
    npm run build
    ```

    This command creates `dist` directory containing the produced deployment
    version. This directory should be then packed by some archiving tool (`zip`, `tar`, `cpio` ... etc.)
    creating the deployment package.

0.  Put the content of the deployment package to your server and make sure
    the web server can access the `index.html` file.
