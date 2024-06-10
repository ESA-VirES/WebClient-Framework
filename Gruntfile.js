// Generated on 2013-07-09 using generator-webapp 0.2.6
// to lift off deprecation warnings from newer node
'use strict';
var os = require('os');
os.tmpDir = os.tmpdir;
var serveStatic = require('serve-static');
var micromatch = require('micromatch');
var LIVERELOAD_PORT = 35729;
var lrSnippet = require('connect-livereload')({port: LIVERELOAD_PORT});
var mountFolder = function (dir) {
    return serveStatic(require('path').resolve(dir));
};

var proxySnippet = require('grunt-connect-proxy2/lib/utils').proxyRequest;

module.exports = function (grunt) {
    // load all grunt tasks
    var packageJson = require('./package.json');
    var devDependencies = Object.keys(packageJson.devDependencies || {});
    var gruntDevDependencies = micromatch(devDependencies, 'grunt-*');
    gruntDevDependencies.forEach(dep => grunt.loadNpmTasks(dep));

    // configurable paths
    var yeomanConfig = {
        app: 'app',
        dist: 'dist',
        node_modules: 'node_modules'
    };

    grunt.initConfig({
        yeoman: yeomanConfig,
        watch: {
            coffee: {
                files: ['<%= yeoman.app %>/scripts/{,*/}*.coffee'],
                tasks: ['coffee:dist']
            },
            compass: {
                files: ['<%= yeoman.app %>/styles/{,*/}*.{scss,sass}'],
                tasks: ['compass:server']
            },
            livereload: {
                options: {
                    livereload: LIVERELOAD_PORT
                },
                files: [
                    '<%= yeoman.app %>/*.html',
                    '{.tmp,<%= yeoman.app %>}/styles/{,*/}*.css',
                    '{.tmp,<%= yeoman.app %>}/scripts/**/*.js',
                    '<%= yeoman.app %>/images/{,*/}*.{png,jpg,jpeg,gif,webp,svg}',
                    '<%= yeoman.app %>/scripts/config.json',
                    '<%= yeoman.app %>/templates/{,*/}*.hbs',
                    '<%= yeoman.app %>/scripts/vendor/vmanip-core/*.js',
                    '<%= yeoman.app %>/scripts/vendor/rectangularboxviewer/*.js'
                ]
            }
        },
        connect: {
            options: {
                port: 9000,
                // change this to '0.0.0.0' to access the server from outside
                hostname: '0.0.0.0'
            },
            //
            // Proxy to a local development server:
            //   - set the right localhost:<port> target
            //   - set plain HTTP protocol
            //   - set the access token
            //
            // Proxy to a remote server:
            //   - enable the right remote host (e.g, testing.vires.services) target
            //   - set HTTPS protocol
            //   - set the access token
            //   - note that older Node.js versions may have problems to
            //     verify the server certificate. Setting secure to false may
            //     help.
            //
            proxies: [{
                context: '/wps',
                host: 'testing.vires.services',
                //host: 'localhost',
                //port: 8300
                https: true,
                //secure: false,
            }, {
                context: '/ows',
                host: 'testing.vires.services',
                //host: 'localhost',
                //port: 8300,
                headers: {
                    "Authorization": "Bearer <put-your-access-token-here>"
                },
                https: true,
                //secure: false,
            }, {
                context: '/custom_data',
                host: 'testing.vires.services',
                //host: 'localhost',
                //port: 8300,
                headers: {
                    "Authorization": "Bearer <put-your-access-token-here>"
                },
                https: true,
                //secure: false,
            }],
            livereload: {
                options: {
                    middleware: function (connect) {
                        return [
                            lrSnippet,
                            proxySnippet,
                            mountFolder('.tmp'),
                            mountFolder(yeomanConfig.app),
                            mountFolder(yeomanConfig.node_modules)
                        ];
                    }
                }
            },
            dist: {
                options: {
                    middleware: function () {
                        return [
                            mountFolder(yeomanConfig.dist)
                        ];
                    }
                }
            }
        },
        open: {
            server: {
                path: 'http://localhost:<%= connect.options.port %>'
            }
        },
        clean: {
            dist: {
                files: [{
                    dot: true,
                    src: [
                        '.tmp',
                        '<%= yeoman.dist %>/*',
                        '!<%= yeoman.dist %>/.git*'
                    ]
                }]
            },
            server: '.tmp'
        },
        coffee: {
            dist: {
                files: [{
                    expand: true,
                    cwd: '<%= yeoman.app %>/scripts',
                    src: '{,*/}*.coffee',
                    dest: '.tmp/scripts',
                    ext: '.js'
                }]
            }
        },
        compass: {
            options: {
                sassDir: '<%= yeoman.app %>/styles',
                cssDir: '.tmp/styles',
                generatedImagesDir: '.tmp/images/generated',
                imagesDir: '<%= yeoman.app %>/images',
                javascriptsDir: '<%= yeoman.app %>/scripts',
                fontsDir: '<%= yeoman.app %>/fonts',
                importPath: '<%= yeoman.node_modules %>',
                httpImagesPath: '/images',
                httpGeneratedImagesPath: '/images/generated',
                httpFontsPath: '/fonts',
                relativeAssets: false
            },
            dist: {},
            server: {
                options: {
                    debugInfo: true
                }
            }
        },
        requirejs: {
            dist: {
                options: {
                    // `name` and `out` is set by grunt-usemin
                    baseUrl: yeomanConfig.app + '/scripts',
                    optimize: 'none',
                    preserveLicenseComments: false,
                    useStrict: true,
                    wrap: true
                }
            }
        },
        rev: {
            dist: {
                files: {
                    src: [
                        '<%= yeoman.dist %>/scripts/{,*/}*.js',
                        '<%= yeoman.dist %>/styles/{,*/}*.css',
                        '<%= yeoman.dist %>/images/{,*/}*.{png,jpg,jpeg,gif,webp}',
                        '<%= yeoman.dist %>/styles/fonts/*'
                    ]
                }
            }
        },
        useminPrepare: {
            options: {
                dest: '<%= yeoman.dist %>'
            },
            html: '<%= yeoman.app %>/index.html'
        },
        usemin: {
            options: {
                dirs: ['<%= yeoman.dist %>']
            },
            html: ['<%= yeoman.dist %>/{,*/}*.html'],
            css: ['<%= yeoman.dist %>/styles/{,*/}*.css']
        },
        imagemin: {
            dist: {
                files: [{
                    expand: true,
                    cwd: '<%= yeoman.app %>/images',
                    src: '{,*/}*.{png,jpg,jpeg}',
                    dest: '<%= yeoman.dist %>/images'
                }]
            }
        },
        svgmin: {
            dist: {
                files: [{
                    expand: true,
                    cwd: '<%= yeoman.app %>/images',
                    src: '{,*/}*.svg',
                    dest: '<%= yeoman.dist %>/images'
                }]
            }
        },
        cssmin: {
        },
        htmlmin: {
            dist: {
                options: {
                },
                files: [{
                    expand: true,
                    cwd: '<%= yeoman.app %>',
                    src: '*.html',
                    dest: '<%= yeoman.dist %>'
                }]
            }
        },

        uglify: {
            dist: {
                files: [
                    {
                        expand: true, // Enable dynamic expansion.
                        cwd: '<%= yeoman.app %>/scripts', // Src matches are relative to this path.
                        src: ['**/*.js'], // Actual pattern(s) to match.
                        dest: '<%= yeoman.dist %>/scripts/', // Destination path prefix.
                        //ext: '.js',   // Dest filepaths will have this extension.
                        //ext modifies file names if there is a point in them
                    },
                ]
            }
        },

        // Put files not handled in other tasks here
        copy: {
            dist: {
                files: [
                    {
                        expand: true,
                        cwd: '<%= yeoman.node_modules %>',
                        dest: '<%= yeoman.dist %>',
                        // If new bower components are installed they have to be added to this list
                        src: [
                            'requirejs/require.js',
                            'jquery/dist/jquery.min.js',
                            "jquery-ui/dist/themes/smoothness/jquery-ui.min.css",
                            // 'jquery-ui/ui/minified/jquery-ui.slider.min.js',
                            'jqueryui-touch-punch/jquery.ui.touch-punch.js',
                            'backbone-amd/backbone-min.js',
                            'underscore-amd/underscore-min.js',
                            'd3/d3.min.js',
                            'D3.TimeSlider/build/d3.timeslider.js',
                            'FileSaver.js/dist/FileSaver.min.js',
                            'backbone.marionette/lib/core/amd/backbone.marionette.min.js',
                            'backbone.wreqr/lib/backbone.wreqr.min.js',
                            'backbone.babysitter/lib/backbone.babysitter.min.js',
                            'requirejs-text/text.js',
                            'require-handlebars-plugin/hbs/handlebars.js',
                            'require-handlebars-plugin/hbs/i18nprecompile.js',
                            'require-handlebars-plugin/hbs/json2.js',
                            'require-handlebars-plugin/hbs/underscore.js',
                            'require-handlebars-plugin/hbs.js',
                            'backbone.marionette.handlebars/backbone.marionette.handlebars.min.js',
                            'bootstrap/dist/*/*',
                            'font-awesome/css/font-awesome.min.css',
                            'd3.Graphs/lib/scripts/av.min.js',
                            'cesium/Build/Cesium/**',
                            'plotty/dist/plotty.min.js',
                            'sumoselect/jquery.sumoselect.min.js',
                            'w2ui/src/w2popup.js',
                            'w2ui/src/w2utils.js',
                            'msgpack-lite/dist/msgpack.min.js',
                            'filepond/dist/filepond.min.js',
                            'graphly/dist/graphly.min.js',
                            'choices.js/assets/scripts/dist/choices.min.js',
                        ]
                    }, {
                        expand: true,
                        flatten: true,
                        cwd: '<%= yeoman.node_modules %>',
                        dest: '<%= yeoman.dist %>/scripts',
                        src: [
                            'jquery-ui/dist/jquery-ui.js',
                        ]
                    }, {
                        expand: true,
                        cwd: '<%= yeoman.app %>',
                        dest: '<%= yeoman.dist %>',
                        src: [
                            'scripts/vendor/**',
                        ]
                    }, {
                        expand: true,
                        flatten: true,
                        cwd: '<%= yeoman.node_modules %>',
                        dest: '<%= yeoman.dist %>/fonts/',
                        src: [
                            '*/fonts/*',
                        ]
                    }, {
                        expand: true,
                        flatten: true,
                        cwd: '<%= yeoman.node_modules %>',
                        dest: '<%= yeoman.dist %>/images/',
                        src: [
                            '*/images/*',
                            '*/img/*',
                        ]
                    }, {
                        expand: true,
                        cwd: '<%= yeoman.app %>',
                        dest: '<%= yeoman.dist %>',
                        src: [
                            'scripts/*.json'
                        ]
                    }, {
                        expand: true,
                        cwd: '<%= yeoman.app %>',
                        dest: '<%= yeoman.dist %>',
                        src: [
                            'templates/**'
                        ]
                    }, {
                        expand: true,
                        dot: true,
                        cwd: '<%= yeoman.app %>',
                        dest: '<%= yeoman.dist %>',
                        src: [
                            '*.{ico,png,txt}',
                            '.htaccess',
                            'images/{,*/}*.{webp,gif}',
                            'styles/fonts/*'
                        ]
                    }, {
                        expand: true,
                        cwd: '.tmp/images',
                        dest: '<%= yeoman.dist %>/images',
                        src: [
                            'generated/*'
                        ]
                    }, {
                        expand: true,
                        flatten: true,
                        cwd: '<%= yeoman.node_modules %>',
                        dest: '<%= yeoman.dist %>/styles/images',
                        src: [
                            'jquery-ui/dist/themes/smoothness/images/*'
                        ]
                    }]
            }
        },
        replace: {
            dist: {
                src: [
                    '<%= yeoman.dist %>/jquery/dist/jquery.min.js',
                    '<%= yeoman.dist %>/backbone-amd/backbone-min.js',
                    '<%= yeoman.dist %>/require-handlebars-plugin/hbs.js',
                    '<%= yeoman.dist %>/cesium/Build/Cesium/Cesium.js'
                ],
                overwrite: true,
                replacements: [
                    {
                        from: '//@',
                        to: '//#'
                    },
                    {
                        from: /r\(\"Shaders\/PointPrimitiveCollectionFS\"\,\[\]\,function\(\).*\}\)/g,
                        to: 'r("Shaders/PointPrimitiveCollectionFS",[],function(){"use strict";return"#ifdef GL_EXT_frag_depth\\n#extension GL_EXT_frag_depth : enable\\n#endif\\nvarying vec4 v_color;\\nvarying vec4 v_outlineColor;\\nvarying float v_innerPercent;\\nvarying float v_pixelDistance;\\n#ifdef RENDER_FOR_PICK\\nvarying vec4 v_pickColor;\\n#endif\\nvoid main()\\n{\\nfloat distanceToCenter = length(gl_PointCoord - vec2(0.5));\\nfloat maxDistance = max(0.0, 0.5 - v_pixelDistance);\\nfloat wholeAlpha = 1.0 - smoothstep(maxDistance, 0.5, distanceToCenter);\\nfloat innerAlpha = 1.0 - smoothstep(maxDistance * v_innerPercent, 0.5 * v_innerPercent, distanceToCenter);\\nvec4 color = mix(v_outlineColor, v_color, innerAlpha);\\ncolor.a *= wholeAlpha;\\nif (color.a < 0.005)\\n{\\ndiscard;\\n}\\n#ifdef GL_EXT_frag_depth\\nfloat z = gl_FragCoord.z;\\ngl_FragDepthEXT = z + ((1.0 - z) * (1.0 - wholeAlpha));\\n#endif\\n#ifdef RENDER_FOR_PICK\\ngl_FragColor = v_pickColor;\\n#else\\ngl_FragColor = color;\\n#endif\\n}"})'
                    }
                ],
                variables: {

                }

            }
        },
        concurrent: {
            server: [
                'compass',
                'coffee:dist'
            ],
            dist: [
                'coffee',
                'compass',
                'imagemin',
                'svgmin',
                'htmlmin'
            ]
        }
    });

    grunt.registerTask('server', [
        'clean:server',
        'concurrent:server',
        'configureProxies',
        'connect:livereload',
        'open',
        'watch'
    ]);

    grunt.registerTask('build', [
        'clean:dist',
        'useminPrepare',
        'concurrent:dist',
        'requirejs',
        'concat',
        'cssmin',
        'uglify',
        'copy:dist',
        'replace',
        'usemin'
    ]);
};
