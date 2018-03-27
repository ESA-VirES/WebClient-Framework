define(['backbone.marionette',
    'communicator',
    'app',
    'models/AVModel',
    'globals',
    'd3',
    'analytics'
], function(Marionette, Communicator, App, AVModel, globals) {
    'use strict';
    var AVView = Marionette.View.extend({
        model: new AVModel.AVModel(),
        className: 'analytics',
        initialize: function() {
            this.isClosed = true;
            this.requestUrl = '';
            this.plotType = 'scatter';
            this.sp = undefined;

            /*$(window).resize(function() {
              this.onResize();
            }.bind(this));*/
            this.connectDataEvents();
        },

        onShow: function() {
            var that = this;
            this.stopListening(Communicator.mediator, 'change:axis:parameters', this.onChangeAxisParameters);
            this.listenTo(Communicator.mediator, 'change:axis:parameters', this.onChangeAxisParameters);

            this.isClosed = false;
            this.selectionList = [];
            this.plotdata = [];
            this.requestUrl = '';
            this.img = null;
            this.overlay = null;
            this.activeWPSproducts = [];
            this.plotType = 'scatter';
            this.prevParams = [];

            $('#tmp_download_button').unbind( 'click' );
            $('#tmp_download_button').remove();

            // TODO: Hack to handle how analyticsviewer re-renders button, need to update analaytics viewer
            d3.select(this.el).append('button')
                .attr('type', 'button')
                .attr('id', 'tmp_download_button')
                .attr('class', 'btn btn-success')
                .attr('style', 'position: absolute; right: 55px; top: 7px; z-index: 1000;')
                .text('Download');


            $('#tmp_download_button').click(function(){
                Communicator.mediator.trigger('dialog:open:download:filter', true);
            });

            this.$('.d3canvas').remove();
            this.$el.append('<div class="d3canvas"></div>');
            this.$('.d3canvas').append('<div id="scatterdiv" style="height:60%;"></div>');
            this.$('.d3canvas').append('<div id="parallelsdiv" style="height:39%;"></div>');

            var swarmdata = globals.swarm.get('data');

            var args = {
                scatterEl: '#scatterdiv',
                histoEl: '#parallelsdiv',
                selection_x: 'Latitude',
                selection_y: ['F'],
                margin: {top: 10, right: 67, bottom: 10, left: 60},
                histoMargin: {top: 55, right: 70, bottom: 25, left: 100},
                shorten_width: 125,
                toIgnoreHistogram: ['Latitude', 'Longitude', 'Radius'],
                fieldsforfiltering: ['F','B_N', 'B_E', 'B_C', 'Dst', 'QDLat','MLT'],
                single_color: true,
                file_save_string: 'VirES_Services_plot_rendering'
            };

            args.filterListChanged = function(param){
              localStorage.setItem('selectedFilterList', JSON.stringify(param));
            };
            args.xAxisSelectionChanged = function(param){
              localStorage.setItem('xAxisSelection', JSON.stringify(param));
            };
            args.yAxisSelectionChanged = function(param){
              localStorage.setItem('yAxisSelection', JSON.stringify(param));
            };
            args.filtersViewChanged = function(param){
              localStorage.setItem('filterViewHidden', JSON.stringify(param));
            };
            args.gridSettingChanged = function(param){
              localStorage.setItem('gridVisible', JSON.stringify(param));
            };

            if(localStorage.getItem('filterViewHidden') !== null){
                args.filters_hidden = JSON.parse(
                    localStorage.getItem('filterViewHidden')
                );
                if(args.filters_hidden){
                    $('#scatterdiv').css('height', '95%');
                    $('#parallelsdiv').css('height', '40px');
                }
            }
            if(localStorage.getItem('gridVisible') !== null){
                args.grid = JSON.parse(localStorage.getItem('gridVisible'));
            }

            var filterList = localStorage.getItem('selectedFilterList');
            if(filterList !== null){
                filterList = JSON.parse(filterList);
                args.fieldsforfiltering = filterList;
            }
            if(localStorage.getItem('prevParams') !== null){
                this.prevParams = JSON.parse(
                    localStorage.getItem('prevParams')
                );
            }

            if (this.sp === undefined){
                this.sp = new scatterPlot(
                    args, function(){},
                    function (values) {
                        if (values !== null){
                            Communicator.mediator.trigger(
                                'cesium:highlight:point',
                                [values.Latitude, values.Longitude, values.Radius]
                            );
                        }else{
                            Communicator.mediator.trigger('cesium:highlight:removeAll');
                        }
                    }, 
                    function(filter){
                        Communicator.mediator.trigger('analytics:set:filter', filter);
                    }
                );

                 // If filters from previous session load them
                if(localStorage.getItem('filterSelection') !== null){
                    var filters = JSON.parse(localStorage.getItem('filterSelection'));
                    Communicator.mediator.trigger('analytics:set:filter', filters);
                    _.map(filters, function(value, key){
                        that.sp.active_brushes.push(key);
                        that.sp.brush_extents[key] = value;
                    });
                }

                // If filters from previous session load them
                if(localStorage.getItem('xAxisSelection') !== null){
                    that.sp.sel_x = JSON.parse(localStorage.getItem('xAxisSelection'));
                }
                // If filters from previous session load them
                if(localStorage.getItem('yAxisSelection') !== null){
                    that.sp.sel_y = JSON.parse(localStorage.getItem('yAxisSelection'));
                }

            }

            $('#scatterdiv').append('<div id="nodatainfo">No data available for your current selection</div>');

            if(swarmdata && swarmdata.length>0){
                args.parsedData = swarmdata;
                that.sp.loadData(args);
            }
            return this;
        }, //onShow end

        connectDataEvents: function(){
            globals.swarm.on('change:data', this.reloadData.bind(this));
        },

        separateVector: function(key, previousKey, vectorChars, separator){
            if (this.sp.uom_set.hasOwnProperty(previousKey)){
                _.each(vectorChars, function(k){
                    this.sp.uom_set[key+separator+k] = 
                        $.extend({}, this.sp.uom_set[previousKey]);
                    this.sp.uom_set[key+separator+k].name = 
                        'Component of '+this.sp.uom_set[previousKey].name;
                }, this);
            }
            if (this.activeParameters.hasOwnProperty(previousKey)){
                _.each(vectorChars, function(k){
                    this.activeParameters[key+separator+k] = 
                        $.extend({}, this.activeParameters[previousKey]);
                    this.activeParameters[key+separator+k].name = 
                        'Component of '+this.activeParameters[previousKey].name;
                }, this);
                delete this.activeParameters[previousKey];
            }

        },

        checkPrevious: function(key, previousIndex, newIndex, replace){
            replace = defaultFor(replace, false);
            if( previousIndex === -1 && newIndex !== -1){
                if(this.sp.sel_y.indexOf(key)===-1){
                    if(!replace){
                        this.sp.sel_y.push(key);
                    }else{
                        this.sp.sel_y = [key];
                    }
                }
            }
        },

        reloadData: function(model, data) {
            // If element already has plot rendering
            if( $(this.el).html()){
                // Prepare to create list of available parameters
                var availableParameters = {};
                var activeParameters = {};
                globals.products.each(function(prod) {
                    if(prod.get('download_parameters')){
                        var par = prod.get('download_parameters');
                        var newKeys = _.keys(par);
                        _.each(newKeys, function(key){
                            availableParameters[key] = par[key];
                            if(prod.get('visible')){
                                activeParameters[key] = par[key];
                            }
                        });
                        
                    }
                });
                this.sp.uom_set = availableParameters;
                this.activeParameters = activeParameters;

                // Remove uom of time
                if(this.sp.uom_set.hasOwnProperty('Timestamp')){
                    this.sp.uom_set['Timestamp'].uom = null;
                }

                // Special cases for separeted vectors
                this.separateVector('B_error', 'B_error', ['X', 'Y', 'Z'], ',');
                this.separateVector('B', 'B_NEC', ['N', 'E', 'C'], '_');
                this.separateVector('B', 'B_NEC', ['N', 'E', 'C'], '_');
                this.separateVector('v_SC', 'v_SC', ['N', 'E', 'C'], '_');
                this.separateVector('B_VFM', 'B_VFM', ['X', 'Y', 'Z'], ',');
                this.separateVector('B', 'B_NEC_resAC',
                    ['resAC_N', 'resAC_E', 'resAC_C'], '_'
                );
                this.separateVector('B', 'B_NEC_res_SIFM',
                    ['N_res_SIFM', 'E_res_SIFM', 'C_res_SIFM'], '_'
                );
                this.separateVector('B', 'B_NEC_res_CHAOS-6-Combined',
                    ['N_res_CHAOS-6-Combined',
                    'E_res_CHAOS-6-Combined',
                    'C_res_CHAOS-6-Combined'], '_'
                );
                this.separateVector('B', 'B_NEC_res_Custom_Model',
                    ['N_res_Custom_Model',
                    'E_res_Custom_Model',
                    'C_res_Custom_Model'], '_'
                );
                this.sp.uom_set['MLT'] = {uom: null, name:'Magnetic Local Time'};
                this.sp.uom_set['QDLat'] = {uom: 'deg', name:'Quasi-Dipole Latitude'};
                this.sp.uom_set['QDLon'] = {uom: 'deg', name:'Quasi-Dipole Longitude'};
                this.sp.uom_set['Dst'] = {uom: null, name:'Disturbance storm time Index'};
                this.sp.uom_set['Kp'] = {uom: null, name:'Global geomagnetic storm Index'};
                this.sp.uom_set['OrbitNumber'] = {uom: null, name:'Orbit number'};
                this.sp.uom_set['IMF_V'] = {uom: 'km/s', name:'Solar wind speed'};
                this.sp.uom_set['IMF_BY_GSM'] = {uom: 'nT', name:'y-component of IMF (GSM frame)'};
                this.sp.uom_set['IMF_BZ_GSM'] = {uom: 'nT', name:'z-component of IMF (GSM frame)'};
                this.sp.uom_set['F10_INDEX'] = {uom: '1e-22 J/s/m^2/Hz', name:'10.7cm Solar Radio Flux'};

                this.activeParameters['MLT'] = {uom: null, name:'Magnetic Local Time'};
                this.activeParameters['QDLat'] = {uom: 'deg', name:'Quasi-Dipole Latitude'};
                this.activeParameters['QDLon'] = {uom: 'deg', name:'Quasi-Dipole Longitude'};
                this.activeParameters['Dst'] = {uom: null, name:'Disturbance storm time Index'};
                this.activeParameters['Kp'] = {uom: null, name:'Global geomagnetic storm Index'};
                this.activeParameters['OrbitNumber'] = {uom: null, name:'Orbit number'};
                this.activeParameters['IMF_V'] = {uom: 'km/s', name:'Solar wind speed'};
                this.activeParameters['IMF_BY_GSM'] = {uom: 'nT', name:'y-component of IMF (GSM frame)'};
                this.activeParameters['IMF_BZ_GSM'] = {uom: 'nT', name:'z-component of IMF (GSM frame)'};
                this.activeParameters['F10_INDEX'] = {uom: '1e-22 J/s/m^2/Hz', name:'10.7cm Solar Radio Flux'};

                globals.swarm.set('uom_set', this.activeParameters);

                $('#tmp_download_button').unbind( 'click' );
                $('#tmp_download_button').remove();

                if(data.length > 0){

                    // TODO: Hack to handle how analyticsviewer re-renders button, need to update analaytics viewer
                    d3.select(this.el).append('button')
                        .attr('type', 'button')
                        .attr('id', 'tmp_download_button')
                        .attr('class', 'btn btn-success')
                        .attr('style', 'position: absolute; right: 55px; top: 7px; z-index: 1000;')
                        .text('Download');

                    $('#tmp_download_button').click(function(){
                        Communicator.mediator.trigger('dialog:open:download:filter', true);
                    });

                    // If data parameters have changed
                    if (!_.isEqual(this.prevParams, _.keys(data[0]))){
                        // Define which parameters should be selected defaultwise as filtering
                        var filterstouse = this.sp.fieldsforfiltering.concat([
                            'n', 'T_elec', 'Bubble_Probability',
                            'Relative_STEC_RMS', 'Relative_STEC', 'Absolute_STEC',
                            'IRC', 'FAC',
                            'EEF'
                        ]);

                        filterstouse = filterstouse.concat(['MLT']);
                        var residuals = _.filter(_.keys(data[0]), function(item) {
                            return item.indexOf('_res_') !== -1;
                        });
                        // If new datasets contains residuals add those instead of normal components
                        if(residuals.length > 0){
                            filterstouse = filterstouse.concat(residuals);
                        }else{
                            if(filterstouse.indexOf('F') === -1){
                              filterstouse.push('F');
                            }
                            if(filterstouse.indexOf('F_error') === -1){
                                filterstouse.push('F_error');
                            }
                        }

                        this.sp.fieldsforfiltering = filterstouse;
                        localStorage.setItem('selectedFilterList', JSON.stringify(filterstouse));

                        // Check if we want to change the y-selection
                        // If previous does not contain key data and new one
                        // does we add key parameter to selection in plot
                        var parasToCheck = [
                            'n', 'F', 'n', 'Absolute_STEC', 'FAC', 'EEF'
                        ];

                        _.each(parasToCheck, function(p){
                            this.checkPrevious(
                                p, this.prevParams.indexOf(p), _.keys(data[0]).indexOf(p)
                            );
                        }, this);

                        // If previous does not contain a residual a new one does
                        // we switch the selection to residual value
                        var resIndex = residuals.indexOf(
                            _.find(_.keys(data[0]), function(item) {
                                return item.indexOf('F_res') !== -1;
                            })
                        );
                        if(resIndex !== -1){
                            var resPar = residuals[resIndex];
                            this.checkPrevious(
                                resPar, this.prevParams.indexOf(resPar),
                                _.keys(data[0]).indexOf(resPar),
                                true
                            );
                        }

                        localStorage.setItem('yAxisSelection', JSON.stringify(this.sp.sel_y));
                        localStorage.setItem('xAxisSelection', JSON.stringify(this.sp.sel_x));
                    } // End of IF to see if data parameters have changed


                    this.prevParams = _.keys(data[0]);
                    localStorage.setItem('prevParams', JSON.stringify(this.prevParams));

                    // Check for special case of only EEF selected
                    var onlyEEF = true;

                    globals.swarm.filtered_collection.each(function(layer){
                      if(layer.get('containerproduct')){
                        if(layer.get('id') !== 'EEF' && layer.get('visible')){
                          onlyEEF = false;
                        }
                      }
                    });

                    if(this.$('.d3canvas').length === 1){
                        $('#scatterdiv').empty();
                        $('#parallelsdiv').empty();
                        var args = {
                            selector: this.$('.d3canvas')[0],
                            parsedData: data
                        };
                        if(onlyEEF){
                            this.sp.toIgnore = ['id','active', 'Radius'];
                        }else{
                            this.sp.toIgnore = ['id','active', 'Spacecraft'];
                        }
                        this.sp.loadData(args);
                    }
                }else{ // Else for if data is greater 0
                    $('#scatterdiv').empty();
                    $('#parallelsdiv').empty();
                    $('#scatterdiv').append('<div id="nodatainfo">No data available for your current selection</div>');
                }
            }
        },

        onChangeAxisParameters: function (selection) {
            this.sp.sel_y=selection;
            this.sp.render();
        },

        close: function() {
            this.isClosed = true;
            this.$el.empty();
            this.triggerMethod('view:disconnect');
        }
    });
    return AVView;
});