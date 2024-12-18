"use strict";

// This is not a full .obj parser.
// see http://paulbourke.net/dataformats/obj/

import { parseOBJ, parseMapArgs, parseMTL } from "/js/parse.js";
import { create1PixelTexture, createTexture } from "/js/texture.js";
import { getExtents, getGeometriesExtents } from "/js/utils.js";
import { vs, fs } from "/js/shaders.js";

async function main() {
  // Get A WebGL context
  /** @type {HTMLCanvasElement} */
  const canvas = document.querySelector("canvas");
  const gl = canvas.getContext("webgl");
  if (!gl) {
    return;
  }

  // compiles and links the shaders, looks up attribute and uniform locations
  const meshProgramInfo = webglUtils.createProgramInfo(gl, [vs, fs]);

  const objHref = "/resources/glade.obj";
  const response = await fetch(objHref);
  const text = await response.text();

  const obj = parseOBJ(text);
  const baseHref = new URL(objHref, window.location.href);
  const matTexts = await Promise.all(
    obj.materialLibs.map(async (filename) => {
      const matHref = new URL(filename, baseHref).href;
      const response = await fetch(matHref);
      return await response.text();
    })
  );
  const materials = parseMTL(matTexts.join("\n"));

  // Load textures asynchronously
  const textures = {
    label: await createTexture(gl, "/resources/baseColorGlade.png"),
    defaultWhite: create1PixelTexture(gl, [255, 255, 255, 255]),
  };

  // Apply textures to materials
  for (const material of Object.values(materials)) {
    Object.entries(material)
      .filter(([key]) => key.endsWith("Map"))
      .forEach(([key, filename]) => {
        let texture = textures[filename];
        if (!texture) {
          texture = textures.label; // Default to wood texture if none found
          textures[filename] = texture;
        }
        material[key] = texture;
      });
  }

  Object.values(materials).forEach((m) => {
    m.shininess = 25;
    m.specular = [1, 1, 1];
  });

  const defaultMaterial = {
    diffuse: [1, 1, 1],
    diffuseMap: textures.defaultWhite,
    ambient: [0, 0, 0],
    specular: [1, 1, 1],
    specularMap: textures.defaultWhite,
    shininess: 400,
    opacity: 1,
  };

  const parts = obj.geometries.map(({ material, data }, index) => {
    if (data.color) {
      if (data.position.length === data.color.length) {
        data.color = { numComponents: 3, data: data.color };
      }
    } else {
      data.color = { value: [1, 1, 1, 1] };
    }

    const bufferInfo = webglUtils.createBufferInfoFromArrays(gl, data);
    return {
      material: {
        ...defaultMaterial,
        ...materials[material],
      },
      bufferInfo,
    };
  });

  const extents = getGeometriesExtents(obj.geometries);
  const range = m4.subtractVectors(extents.max, extents.min);
  // amount to move the object so its center is at the origin
  const objOffset = m4.scaleVector(
    m4.addVectors(extents.min, m4.scaleVector(range, 0.5)),
    -1
  );
  const cameraTarget = [0, 0, 0];
  // figure out how far away to move the camera so we can likely
  // see the object.
  const radius = m4.length(range) * 1.2;
  const cameraPosition = m4.addVectors(cameraTarget, [0, 0, radius]);
  // Set zNear and zFar to something hopefully appropriate
  // for the size of this object.
  const zNear = radius / 100;
  const zFar = radius * 3;

  function render(time) {
    time *= 0.001;
  
    webglUtils.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.enable(gl.DEPTH_TEST);
  
    const fieldOfViewRadians = (60 * Math.PI) / 180;
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const projection = m4.perspective(fieldOfViewRadians, aspect, zNear, zFar);
  
    const up = [0, 1, 0];
    const camera = m4.lookAt(cameraPosition, cameraTarget, up);
    const view = m4.inverse(camera);
  
    const sharedUniforms = {
      u_lightDirection: m4.normalize([-1, 3, 5]),
      u_view: view,
      u_projection: projection,
      u_viewWorldPosition: cameraPosition,
    };
  
    gl.useProgram(meshProgramInfo.program);
    webglUtils.setUniforms(meshProgramInfo, sharedUniforms);
  
    // Gunakan rotasi dari mouse
    let u_world = m4.identity();

    // Rotasi awal 180 derajat agar menghadap kamera
    u_world = m4.yRotate(u_world, Math.PI);
    
    // Tambahkan rotasi berdasarkan interaksi mouse
    u_world = m4.yRotate(u_world, rotationY); // Y-Rotasi dari mouse
    u_world = m4.xRotate(u_world, rotationX); // X-Rotasi dari mouse
    
    // Terjemahkan objek agar berada di posisi tengah
    u_world = m4.translate(u_world, ...objOffset);
  
    for (const { bufferInfo, material } of parts) {
      webglUtils.setBuffersAndAttributes(gl, meshProgramInfo, bufferInfo);
      webglUtils.setUniforms(meshProgramInfo, { u_world }, material);
      webglUtils.drawBufferInfo(gl, bufferInfo);
    }
  
    requestAnimationFrame(render);
  }
  
  requestAnimationFrame(render);
}
let rotationX = 0;
let rotationY = 0;
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

const canvas = document.querySelector("canvas");

canvas.addEventListener("mousedown", (event) => {
  isDragging = true;
  lastMouseX = event.clientX;
  lastMouseY = event.clientY;
});

canvas.addEventListener("mousemove", (event) => {
  if (isDragging) {
    const deltaX = event.clientX - lastMouseX;
    const deltaY = event.clientY - lastMouseY;

    // Ubah rotasi berdasarkan pergerakan mouse
    rotationY += deltaX * 0.01; // Sensitivitas rotasi sumbu Y
    rotationX += deltaY * 0.01; // Sensitivitas rotasi sumbu X

    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
  }
});

canvas.addEventListener("mouseup", () => {
  isDragging = false;
});

canvas.addEventListener("mouseout", () => {
  isDragging = false;
});

main();
