define([
  'jquery'
], function ($) {

  'use strict';

  function XTKViewer(opts) {
    dat.GUI.prototype.removeFolder = function (name) {
      if (this.__folders[name]) {
        this.__folders[name].close();
        // this.__ul.removeChild(this.__folders[name].li);
        //dom.removeClass(this.__folders[name].li, 'folder');
        this.__folders[name] = undefined;
        this.onResize();
      }
    };

    this.mainGUI = null;
    this.idx = 0;
    this.renderer = null;
    this.cameraPosition = opts.cameraPosition || [120, 80, 160];
    this.backgroundColor = opts.backgroundColor || [1, 1, 1];
    this.container = opts.elem;
    this.animSpeed = 1;

    // create and initialize a 3D renderer
    var r = this.renderer = new X.renderer3D();
    r.container = opts.elem;
    r.bgColor = this.backgroundColor;

    r.init();

    this.volumes = {};
    this.meshes = {};
    this.volumes_to_add = [];
    this.meshes_to_add = [];

    // adjust the camera position a little bit, just for visualization purposes
    r.camera.position = this.cameraPosition;
  }

  XTKViewer.prototype.createRenderer = function () {
    // create and initialize a 3D renderer
    var r = this.renderer = new X.renderer3D();
    r.container = this.container;
    r.bgColor = this.backgroundColor;
    r.init();
    r.camera.position = this.cameraPosition;
  };

  XTKViewer.prototype.onResize = function () {

    this.renderer._width = this.renderer._container.clientWidth;
    this.renderer._height = this.renderer._container.clientHeight;

    this.renderer._canvas.width = this.renderer._container.clientWidth;
    this.renderer._canvas.height = this.renderer._container.clientHeight;

    this.renderer.resetBoundingBox();
    this.renderer.resetViewAndRender();

  };

  function str2ab(str) {
    var buf = new ArrayBuffer(str.length);
    var bufView = new Uint8Array(buf);
    for (var i = 0, strLen = str.length; i < strLen; i++) {
      bufView[i] = str.charCodeAt(i);
    }
    return buf;
  }

  // Takes (multiple) obj/mtl pairs with textures and adds them to the viewer.
  // NOTE: Currently only the first obj/mtl pair is displayed!
  XTKViewer.prototype.addMesh = function (opts) {

    if (typeof this.renderer === 'undefined' || this.renderer == null)
      this.createRenderer();


    var modelnames = Object.keys(opts.models[0]),
      modeldata = opts.models[0][modelnames[0]],
      mtldata = opts.mtls[0][(modelnames[0].split('.')[0] + ".mtl")];

    console.log('[XTKViewer.addMesh] adding obj/mtl pair: ' + modelnames[0]);

    var obj = K3D.parse.fromOBJ(modeldata);

    console.log('OBJ (K3D) stats:');
    console.log(' * objects: ' + Object.keys(obj.groups).length);
    _.forEach(Object.keys(obj.groups), function (value, key) {
      var object = obj.groups[value];
      console.log(' * name:     ' + value);
      console.log(' * verts:     ' + (object.to - object.from));
      console.log(' * faces:     ' + (object.to - object.from) / 3);
    });

    var single_objs = K3D.parse.toIndividualOBJs(obj);
    var mtl = K3D.parse.fromMTL(mtldata);

    var root = new X.object();

    for (var idx = 0; idx < single_objs.length; idx++) {
      var obj = single_objs[idx].data,
        name = single_objs[idx].name,
        material = single_objs[idx].material,
        mesh = new X.mesh();

      mesh.file = name + '.obj';
      mesh.filedata = K3D.parse._strToBuff(obj);

      if (material && mtl[material]) {
        var tex_name = mtl[material].map_Kd;
        // mesh.texture.file = 'data/curtain-obj/159be6d2-2913-40eb-8a7f-d8807d7d3bd1.png';
        mesh.texture._image = new Image();
        // // Make sure that the image data is loaded before the mesh tries to generate the WebGL texture:
        // mesh.texture._image.addEventListener("load", function() {
        // }, false);
        mesh.texture.flipY = true;

        var tex_data = _.find(opts.textures, function (tex_info) {
          if (tex_info[tex_name]) return true;
          return false;
        });
        var key = Object.keys(tex_data)[0];
        mesh.texture._image.src = K3D.convertToPNGURI(tex_data[key]);
      }

      mesh.color = [0, 1, 0];
      root.children.push(mesh);
    }

    var label = opts.label || 'Curtain';

    // Cache the mesh for later removal:
    var entries = this.meshes[opts.label];

    if (!entries) {
      this.meshes[opts.label] = [];
      entries = this.meshes[opts.label];
      label += ' ' + (entries.length + 1);
    } else {
      entries = this.meshes[opts.label];
      label += ' ' + (entries.length + 1);
    }

    var mesh_info = {
      label: label,
      object: root,
      gui: null // will be set in 'onShowtime' callback
    };

    entries.push(mesh_info);
    this.meshes_to_add.push(mesh_info);

    // The onShowtime method gets executed after all files were fully loaded and
    // just before the first rendering attempt. To ensure that the callback gets called
    // when volumes are added the internal '_onShowtime' flag is set to 'false' here
    // so that the callback gets called on the next render tick.
    this.renderer._onShowtime = false;

    this.renderer.onShowtime = function () {

      if (!this.mainGUI) {
        var gui = this.mainGUI = new dat.GUI({
          autoPlace: true
        });
        this.renderer.container.appendChild(gui.domElement);
      }

      for (var idx = 0; idx < this.meshes_to_add.length; idx++) {
        var mesh_info = this.meshes_to_add[idx];
        var gui = this.addMeshToGUI(mesh_info.label, mesh_info.object);
        mesh_info['gui'] = gui;

        var center = [0, 0, 0];
        _.forEach(mesh_info.object.children, function (mesh) {

          // FIXXME: for now we scale up the geometry so that the X.interactor3D is working better.
          // At low scales it behaves too unfriendly (near/far planes, rotation center are off).
          mesh.transform.scale(200, 200, 200);

          var centroid = mesh.points._centroid;
          var x = (center[0] + centroid[0]) / 2;
          var y = (center[1] + centroid[1]) / 2;
          var z = (center[2] + centroid[2]) / 2;
          center = [x, y, z];
        });

        this.renderer.camera.position = [0, 0, -3];
        this.renderer.camera.focus = center;
      }

      this.meshes_to_add = [];

    }.bind(this);

    this.renderer.add(root);
    this.renderer.render();
  };

  XTKViewer.prototype.addVolume = function (opts) {

    if (typeof this.renderer === 'undefined' || this.renderer == null)
      this.createRenderer();
    // FIXXME: define an array with supported mimetypes to not have to hardcode
    // the mimetypes here and below!

    //this.createRenderer();
    var volumes = null;
    if (opts.data['application/x-nifti']) {
      volumes = opts.data['application/x-nifti'];
    } else { // For loading testdata from a local file 'octet-stream' is the correct mimetype:
      volumes = opts.data['application/octet-stream'];
    }

    if (!volumes) {
      console.log('[XTKViewer::addVolume] AoI contains no volume data, skipping...');
      return;
    }

    var num_volumes = Object.keys(volumes).length;


    for (var idx = 0; idx < num_volumes; idx++) {
      var volume_item = volumes[idx],
        volume_info = Object.keys(volume_item);

      var volume = new X.volume();

      // FIXXME: hack to satisfy xtk, which obviously determines the format of the volume data by the ending of the url it gets.
      // I appended a dummy file here, so xtk gets the format, the backend W3DS server will simply discard the extra parameter...
      volume.file = opts.filename + '&dummy.nii';

      var data = volume_item[volume_info[0]];
      if (typeof data === 'string') {
        volume.filedata = str2ab(volume_item[volume_info[0]]);
      } else {
        volume.filedata = volume_item[volume_info[0]];
      }

      volume.volumeRendering = opts.volumeRendering || undefined;
      volume.opacity = opts.opacity || undefined;
      volume.minColor = opts.minColor || undefined;
      volume.maxColor = opts.maxColor || undefined;
      volume.reslicing = opts.reslicing || undefined;

      var label = opts.label || 'Volume';

      // Cache the volume for later removal:
      var entries = this.volumes[opts.filename];
      if (!entries) {
        this.volumes[opts.filename] = [];
        entries = this.volumes[opts.filename];
        label += ' ' + (entries.length + 1);
      } else {
        entries = this.volumes[opts.filename];
        label += ' ' + (entries.length + 1);
      }

      var volume_info = {
        label: label,
        object: volume,
        gui: null // will be set in 'onShowtime' callback
      };
      entries.push(volume_info);
      this.volumes_to_add.push(volume_info);

      this.renderer.add(volume);
    }

    // The onShowtime method gets executed after all files were fully loaded and
    // just before the first rendering attempt. To ensure that the callback gets called
    // when volumes are added the internal '_onShowtime' flag is set to 'false' here
    // so that the callback gets called on the next render tick.
    this.renderer._onShowtime = false;

    this.renderer.onShowtime = function (entries) {

      if (!this.mainGUI) {
        var gui = this.mainGUI = new dat.GUI({
          autoPlace: true
        });
        this.renderer.container.appendChild(gui.domElement);
        this.baseInitDone = true;
      }

      // Note: we need to create the GUI during onShowtime(..) since we do not know the
      // volume dimensions before the loading was completed
      for (var idx = 0; idx < this.volumes_to_add.length; idx++) {
        var volume_info = this.volumes_to_add[idx];
        var gui = this.addVolumeToGUI(volume_info.label, volume_info.object);
        volume_info['gui'] = gui;
      }
      this.volumes_to_add = [];
    }.bind(this, entries);

    // NOTE: This triggers the loading of the volume and executes
    // r.onShowtime() once done. Be sure to call render AFTER you
    // added a volume. Otherwise values on the volume like min, max.
    // range are not yet calculated!
    this.renderer.render();
  };

  XTKViewer.prototype.removeObject = function (layer_name) {
    var data_set = this.volumes[layer_name] || this.meshes[layer_name];

    if (data_set) {
      _.forEach(data_set, function (info) {
        if (info && info.object && info.object._children) {
          this.renderer.remove(info.object);
          if (info.gui) {
            this.removeGui(info.gui);
          }
        } else {
          // FIXXME: Why does this happen?
          console.log('[XTKViewer::removeObject] Trying to remove invalid object, this should not happen!');
        }
      }.bind(this));

      if (this.volumes[layer_name]) {
        delete this.volumes[layer_name];
      } else {
        delete this.meshes[layer_name];
      }

      // Recenter the view after all volumes are removed:
      if (Object.keys(this.volumes).length === 0 && Object.keys(this.meshes).length === 0) {
        this.onResize();
        if (this.mainGUI) {
          this.removeGui(this.mainGUI);
          this.mainGUI = null;
        }
      }
    }
  };

  XTKViewer.prototype.addVolumeToGUI = function (label, volume) {
    // this.mainGUI.removeFolder(label);

    // the following configures the gui for interacting with the X.volume
    var volumegui = this.mainGUI.addFolder(label);
    // now we can configure controllers which..
    // .. switch between slicing and volume rendering
    var vrController = volumegui.add(volume, 'volumeRendering').name('Volume Rendering');

    var segmentation_folder = volumegui.addFolder('Segmentation Settings');

    // the min and max color which define the linear gradient mapping
    segmentation_folder.addColor(volume, 'minColor');
    segmentation_folder.addColor(volume, 'maxColor');
    // .. configure the volume rendering opacity
    segmentation_folder.add(volume, 'opacity', 0, 1).listen();
    // .. and the threshold in the min..max range
    segmentation_folder.add(volume, 'lowerThreshold', volume.min, volume.max + 0.0001);
    segmentation_folder.add(volume, 'upperThreshold', volume.min, volume.max + 0.0001);
    segmentation_folder.add(volume, 'windowLow', volume.min, volume.max);
    segmentation_folder.add(volume, 'windowHigh', volume.min, volume.max);
    // the indexX,Y,Z are the currently displayed slice indices in the range
    // 0..dimensions-1

    var slice_folder = volumegui.addFolder('Slicing');
    slice_folder.add(volume, 'indexX', 0, volume.range[0] - 1);
    slice_folder.add(volume, 'indexY', 0, volume.range[1] - 1);
    slice_folder.add(volume, 'indexZ', 0, Math.round(volume.range[2] - 1));

    // FIXXME: refactor, this is a quick hack at the moment:
    var AnimateAxis = function (volume, axis, speed) {
      this.volume = volume;
      this.speed = speed || 1;
      this.isStarted = false;
      this.curIdx = 0;
      this.speed = speed;
      this.oldSpeed = speed;

      this.axisMembers = ['indexX', 'indexY', 'indexZ'];

      if (axis === 'x') {
        this.axis = this.axisMembers[0];
        this.maxIdx = volume.range[0] + 1;
      } else if (axis === 'y') {
        this.axis = this.axisMembers[1];
        this.maxIdx = volume.range[1] + 1;
      } else if (axis === 'z') {
        this.axis = this.axisMembers[2];
        this.maxIdx = volume.range[2] + 1;
      } else {
        throw Error('[AnimateAxis::ctor] no valid axis given!');
      }

      this.stop = function () {
        clearInterval(this.handle);
        this.isStarted = false;
      };

      this.start = function () {
        if (this.isStarted) {
          this.stop();
        } else {
          this.handle = setInterval(function () {
            if (this.curIdx > this.maxIdx) {
              this.curIdx = 0;
            }
            this.volume[this.axis] = this.curIdx++;

            // React to speed settings change:
            if (this.speed !== this.oldSpeed) {
              this.stop();
              this.start();
            }
          }.bind(this), this.speed);
          this.isStarted = true;
        }
      };
    };

    var min_speed = 200;
    var anim_folder = volumegui.addFolder('Animation Settings');
    var xanimation = new AnimateAxis(volume, 'x', min_speed);
    anim_folder.add(xanimation, 'start').name('Toggle x-axis animation');
    anim_folder.add(xanimation, 'speed', 0, min_speed).name('X animation speed').step(1);

    var yanimation = new AnimateAxis(volume, 'y', min_speed);
    anim_folder.add(yanimation, 'start').name('Toggle y-axis animation');
    anim_folder.add(yanimation, 'speed', 0, min_speed).name('Y animation speed').step(1);

    var zanimation = new AnimateAxis(volume, 'z', min_speed);
    anim_folder.add(zanimation, 'start').name('Toggle z-axis animation');
    anim_folder.add(zanimation, 'speed', 0, min_speed).name('Z animation speed').step(1);

    volumegui.open();

    return volumegui;
  };

  XTKViewer.prototype.addMeshToGUI = function (label, mesh) {
    var meshgui = this.mainGUI.addFolder(label + this.idx++);
    var meshVisibleController = meshgui.add(mesh, 'visible');
    //var meshColorController = meshgui.addColor(mesh, 'color');
    meshgui.open();

    return meshgui;
  };

  XTKViewer.prototype.reset = function () {
    _.each(_.keys(this.volumes), function (v) {
      this.removeObject(v);
    }, this);
    _.each(_.keys(this.meshes), function (v) {
      this.removeObject(v);
    }, this);

    if (this.mainGUI) {
      this.removeGui(this.mainGUI);
    }
  };

  XTKViewer.prototype.destroy = function () {
    _.each(_.keys(this.volumes), function (v) {
      this.removeObject(v);
    }, this);
    _.each(_.keys(this.meshes), function (v) {
      this.removeObject(v);
    }, this);

    this.renderer.destroy();
    if (this.mainGUI) {
      this.removeGui(this.mainGUI);
    }
  };

  XTKViewer.prototype.removeGui = function (gui) {
    var el = gui.domElement;
    el.parentNode.removeChild(el);
  };

  return XTKViewer;
});