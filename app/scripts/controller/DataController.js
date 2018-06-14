(function() {
  'use strict';

  var root = this;

  root.require([
    'backbone',
    'communicator',
    'globals',
    'hbs!tmpl/wps_getdata',
    'hbs!tmpl/wps_fetchData',
    'app',
    'papaparse',
    'msgpack',
    'graphly'
  ],

  function( Backbone, Communicator, globals, wps_getdataTmpl, wps_fetchDataTmpl, App, Papa) {

    var DataController = Backbone.Marionette.Controller.extend({

      initialize: function(options){

        this.selection_list = [];
        this.activeWPSproducts = [];
        this.activeModels = [];
        this.selected_time = null;

        this.listenTo(Communicator.mediator, "map:layer:change",this.changeLayer);
        this.listenTo(Communicator.mediator, "map:multilayer:change",this.multiChangeLayer);
        this.listenTo(Communicator.mediator, "selection:changed", this.onSelectionChanged);
        this.listenTo(Communicator.mediator, 'time:change', this.onTimeChange);
        this.listenTo(Communicator.mediator, 'manual:init', this.onManualInit);

        this.listenTo(Communicator.mediator, "analytics:set:filter", this.onAnalyticsFilterChanged);
        this.xhr = null;
       
      },

      onManualInit: function(){
        // TODO: Check to see if already active products are configured
        for (var i = 0; i < globals.products.models.length; i++) {
          if(globals.products.models[i].get('model') && globals.products.models[i].get('visible')){
            this.activeModels.push(globals.products.models[i].get("download").id);
          }
        }
      },

      checkModelValidity: function(){
        // Added some checks here to see if model is outside validity
        $(".validitywarning").remove();
        var invalid_models = [];

        if(this.activeModels.length>0){
          var that = this;
          for (var i = this.activeModels.length - 1; i >= 0; i--) {
            var model = globals.products.find(function(model) { return model.get('download').id == that.activeModels[i]; });
            if(model.get("validity")){
              var val = model.get("validity");
              var start = new Date(val.start);
              var end = new Date(val.end);
              if(this.selected_time && (this.selected_time.start < start || this.selected_time.end > end)){
                invalid_models.push({
                  model: model.get('download').id,
                  start: start,
                  end: end
                });
              }
            }
          }
        }

        if(invalid_models.length>0){
          var invalid_models_string = '';
          for (var i = invalid_models.length - 1; i >= 0; i--) {
            invalid_models_string += invalid_models[i].model+' validity:  ' + 
              getISODateTimeString(invalid_models[i].start).slice(0, -5) +'Z - ' + 
              getISODateTimeString(invalid_models[i].end).slice(0, -5) + 'Z<br>';
          }

          showMessage('warning', (
            'The current time selection is outside the validity of the model, '+
                'data is displayed for the last valid date, please take this into consideration when analysing the data.<br>'+
                invalid_models_string+
                'Tip: You can see the validity of the model in the time slider.'
            
)          , 30, 'validitywarning');

        }
      },

      updateLayerResidualParameters: function () {
        // Manage additional residual parameter for Swarm layers
        globals.products.each(function(product) {

          if(product.get("satellite")=="Swarm"){

            // Get Layer parameters
            var pars = product.get("parameters");

            var selected = null;

            // Remove already added model residuals
            var keys = _.keys(pars);
            for (var i = keys.length - 1; i >= 0; i--) {
              if(pars[keys[i]].residuals){
                if(pars[keys[i]].selected){
                  selected = keys[i];
                }
                delete pars[keys[i]];
              }
            }

            for (var i = this.activeModels.length - 1; i >= 0; i--) {
              
              pars[this.activeModels[i]] = {
                  "range": [-10, 40],
                  "uom":"nT",
                  "colorscale": "jet",
                  "name": ("Residuals to "+this.activeModels[i]),
                  "residuals": true
              };
              if(this.activeModels[i] == selected){
                pars[this.activeModels[i]].selected = true;
              }

              product.set({"parameters": pars});
            }
          }
        }, this);
        // Make sure any possible opened settings are updated
        Communicator.mediator.trigger("layer:settings:changed");
      },


      changeLayer: function(options) {
        if (!options.isBaseLayer){
          var product = globals.products.find(function(model) { return model.get('name') == options.name; });
          if (product){
            if(options.visible){
              if (product.get("model")){
                this.activeModels.push(product.get("download").id);
                this.updateLayerResidualParameters();
                this.checkSelections();
              }
            }else{
              if (this.activeModels.indexOf(product.get("download").id)!=-1){
                this.activeModels.splice(this.activeModels.indexOf(product.get("download").id), 1);
                this.updateLayerResidualParameters();
                this.checkSelections();
              }
            }
          }
        }

        this.checkModelValidity();
      },
      

      multiChangeLayer: function(layers) {
        this.activeWPSproducts = [];
        for (var i = layers.length - 1; i >= 0; i--) {
          var product = globals.products.find(function(model) { return model.get('download').id == layers[i]; });
          if (product){
              if (product.get("processes")){
                _.each(product.get("processes"), function(process){
                  this.activeWPSproducts.push(process.layer_id);
                },this);
              } 
          }
        }
        localStorage.setItem('swarmProductSelection', JSON.stringify(this.activeWPSproducts));
        this.checkSelections();
        this.checkModelValidity();
      },

      onSelectionChanged: function(bbox) {
        
        if(bbox){
          this.selection_list.push(bbox);
          this.checkSelections();
        }else{
          this.plotdata = [];
          this.selection_list = [];
          this.checkSelections();
        }

        
      },

      onAnalyticsFilterChanged: function (filters) {
        //globals.swarm.set({filters: filters});
      },

      checkSelections: function(){
        if (this.selected_time == null)
          this.selected_time = Communicator.reqres.request('get:time');

        if (this.activeWPSproducts.length > 0 && this.selected_time){
          this.sendRequest();
        }else{
          globals.swarm.set({data:[]});
          //Communicator.mediator.trigger("map:clear:image");
          //$(".colorlegend").empty();
        }
      },

      onTimeChange: function (time) {
        this.selected_time = time;
        this.checkSelections();
        this.checkModelValidity();
      },

      sendRequest: function(){

        var that = this;
        var map_crs_reverse_axes = true;

        var retrieve_data = [];

        globals.products.each(function(model) {
          if (that.activeWPSproducts.indexOf(model.get("views")[0].id)!=-1) {
            var processes = model.get("processes");
            _.each(processes, function(process){
              if(process){
                switch (process.id){
                  case "retrieve_data":
                    retrieve_data.push({
                      layer:process.layer_id,
                      url: model.get("views")[0].urls[0]
                    });
                  break;
                }
              }
            }, this);
          }
        }, this);


        if (retrieve_data.length > 0){

          var collections = {};
          for (var i = retrieve_data.length - 1; i >= 0; i--) {
            var sat = false;
            var product_keys = _.keys(globals.swarm.products);
            for (var j = product_keys.length - 1; j >= 0; j--) {
              var sat_keys = _.keys(globals.swarm.products[product_keys[j]]);
              for (var k = sat_keys.length - 1; k >= 0; k--) {
                if (globals.swarm.products[product_keys[j]][sat_keys[k]] == retrieve_data[i].layer){
                  sat = sat_keys[k];
                }
              }
            }
            if(sat){
              if(collections.hasOwnProperty(sat)){
                collections[sat].push(retrieve_data[i].layer);
              }else{
                collections[sat] = [retrieve_data[i].layer];
              }
            }
           
          }

          // Sort the "layers" to sort the master products based on priority
          for (var k in collections){
            collections[k].sort(productSortingFunction);
          }

          var options = {
            "collections_ids": JSON.stringify(collections, Object.keys(collections).sort()),
            "begin_time": getISODateTimeString(this.selected_time.start),
            "end_time": getISODateTimeString(this.selected_time.end)
          };

          
          var variables = [
            "F", "F_error", "B_NEC_resAC", "B_VFM", "B_error", "B_NEC", "n", "T_elec", "U_SC",
            "v_SC", "Bubble_Probability", "Kp", "Dst", "QDLat", "QDLon", "MLT",
            "B_NEC_res_IGRF12","B_NEC_res_SIFM","B_NEC_res_CHAOS-6-Combined",
            "B_NEC_res_Custom_Model", "F_res_IGRF12","F_res_SIFM",
            "F_res_CHAOS-6-Combined", "F_res_Custom_Model",
            "Relative_STEC_RMS", "Relative_STEC", "Absolute_STEC", "GPS_Position", "LEO_Position", "Elevation_Angle", "Absolute_VTEC",
            "IRC", "IRC_Error", "FAC", "FAC_Error",
            "EEF", "RelErr", "OrbitNumber",
            "SunDeclination","SunRightAscension","SunHourAngle","SunAzimuthAngle","SunZenithAngle",
            "F10_INDEX",
            // New models
            "F_res_MCO_SHA_2C", "B_NEC_res_MCO_SHA_2C",
            "F_res_MCO_SHA_2D", "B_NEC_res_MCO_SHA_2D",
            "F_res_MCO_SHA_2F", "B_NEC_res_MCO_SHA_2F",
            "F_res_MLI_SHA_2C", "B_NEC_res_MLI_SHA_2C",
            "F_res_MLI_SHA_2D", "B_NEC_res_MLI_SHA_2D",
            "F_res_MMA_SHA_2C-Primary", "B_NEC_res_MMA_SHA_2C-Primary",
            "F_res_MMA_SHA_2C-Secondary", "B_NEC_res_MMA_SHA_2C-Secondary",
            "F_res_MIO_SHA_2C-Primary", "B_NEC_res_MIO_SHA_2C-Primary",
            "F_res_MIO_SHA_2C-Secondary", "B_NEC_res_MIO_SHA_2C-Secondary",
            "F_res_MIO_SHA_2D-Primary", "B_NEC_res_MIO_SHA_2D-Primary",
            "F_res_MIO_SHA_2D-Secondary", "B_NEC_res_MIO_SHA_2D-Secondary"
          ];

          // See if magnetic data actually selected if not remove residuals
          var magdata = false;
          _.each(collections, function(vals){
            if(_.find(vals, function(v){
              if(v.indexOf("MAG")!=-1){
                return true}
              })){
              magdata = true;
            }
          });

          if(!magdata){
            variables = _.filter(variables, function(v){
              if(v.indexOf("_res_")!=-1){
                return false;
              }else{
                return true;
              }
            })
          }

          // Remove parameters that need calculation if EEF is selected as data
          // has no radius and can't be calculated without it
          var eef_data = false;
          _.each(collections, function(vals){
            if(_.find(vals, function(v){
              if(v.indexOf("EEF")!=-1){
                return true}
              })){
              eef_data = true;
            }
          });

          if (eef_data){
            variables = _.filter(variables, function(v){
              if(v.indexOf("_res_")!=-1 ||
                 v.indexOf("QDLat")!=-1 ||
                 v.indexOf("QDLon")!=-1 ||
                 v.indexOf("MLT")!=-1){
                return false;
              }else{
                return true;
              }
            })
          }

          options.variables = variables.join(",");
          options.mimeType = 'application/msgpack';


          if(this.selection_list.length > 0){
            var bb = this.selection_list[0];
            options["bbox"] = bb.s + "," + bb.w + "," + bb.n + "," + bb.e;
          }
                
          var shc_model = _.find(globals.products.models, function(p){return p.get("shc") != null;});

          if(shc_model){
            options["shc"] = shc_model.get("shc");
          }

          if(this.activeModels.length > 0)
            options["model_ids"] = this.activeModels.join();

          var req_data = wps_fetchDataTmpl(options);

          if(this.xhr !== null){
            // A request has been sent that is not yet been returned so we need to cancel it
            Communicator.mediator.trigger("progress:change", false);
            this.xhr.abort();
            this.xhr = null;
          }

          this.xhr = new XMLHttpRequest();
          this.xhr.open('POST', retrieve_data[0].url, true);
          this.xhr.responseType = 'arraybuffer';
          var that = this;

          this.xhr.onerror = function(e) {
            that.xhr = null;
            Communicator.mediator.trigger("progress:change", false);
          }

          this.xhr.onload = function(e) {
            that.xhr = null;
            Communicator.mediator.trigger("progress:change", false);

            if(e.target.status !== 200){
              globals.swarm.set({data: {}});
              return;
            }

            var tmp = new Uint8Array(this.response);
            var dat = msgpack.decode(tmp);

            var ids = {
              'A': 'Alpha',
              'B': 'Bravo',
              'C': 'Charlie',
              'NSC': 'NSC'
            };

            if(dat.hasOwnProperty('Spacecraft')) {
              dat['id'] = [];
              for (var i = 0; i < dat.Timestamp.length; i++) {
                dat.id.push(ids[dat.Spacecraft[i]]);
              }
            }

            if(dat.hasOwnProperty('Timestamp')) {
              for (var i = 0; i < dat.Timestamp.length; i++) {
                dat.Timestamp[i] = new Date(dat.Timestamp[i]*1000);
              }
            }
            if(dat.hasOwnProperty('timestamp')) {
              for (var i = 0; i < dat.Timestamp.length; i++) {
                dat.Timestamp[i] = new Date(dat.timestamp[i]*1000);
              }
            }
            if(dat.hasOwnProperty('latitude')) {
              dat['Latitude'] = dat['latitude'];
              delete dat.latitude;
            }
            if(dat.hasOwnProperty('longitude')) {
              dat['Longitude'] = dat['longitude'];
              delete dat.longitude;
            }
            if(!dat.hasOwnProperty('Radius')) {
              dat['Radius'] = [];
              var refKey = 'Timestamp';
              if(!dat.hasOwnProperty(refKey)){
                refKey = 'timestamp';
              }
              for (var i = 0; i < dat[refKey].length; i++) {
                dat['Radius'].push(6832000)
              }
            }

            for(var key in dat){
              if(VECTOR_BREAKDOWN.hasOwnProperty(key)){
                dat[VECTOR_BREAKDOWN[key][0]] = [];
                dat[VECTOR_BREAKDOWN[key][1]] = [];
                dat[VECTOR_BREAKDOWN[key][2]] = [];
                for (var i = 0; i < dat[key].length; i++) {
                  dat[key][i]
                  dat[VECTOR_BREAKDOWN[key][0]].push(dat[key][i][0]);
                  dat[VECTOR_BREAKDOWN[key][1]].push(dat[key][i][1]);
                  dat[VECTOR_BREAKDOWN[key][2]].push(dat[key][i][2]);
                }
                delete dat[key];
              }
            }
            // This should only happen here if there has been 
            // some issue with the saved filter configuration
            // Check if current brushes are valid for current data
            var idKeys = Object.keys(dat);
            var filters = globals.swarm.get('filters');
            var filtersSelec = JSON.parse(localStorage.getItem('filterSelection'));
            var filtersmodified = false;
            if(filters){
              for (var f in filters){
                if(idKeys.indexOf(f) === -1){
                    delete filters[f];
                    delete filtersSelec[f];
                    filtersmodified = true;
                }
              }
              if(filtersmodified){
                globals.swarm.set('filters', filters);
                localStorage.setItem('filterSelection', JSON.stringify(filtersSelec));
              }

            }
            
            globals.swarm.set({data: dat});
          };
          Communicator.mediator.trigger("progress:change", true);
          this.xhr.send(req_data);
        }
      },

    });
    return new DataController();
  });

}).call( this );
