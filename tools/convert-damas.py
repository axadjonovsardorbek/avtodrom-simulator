# Converts the downloaded "Chevrolet Damas" OBJ (from Damas.rar) to a GLB with Blender, splitting the
# combined wheel meshes into loose parts so tools/prepare-car.mjs can rig the four wheels.
#
#   bsdtar -xf Damas.rar            (in an empty folder)
#   /Applications/Blender.app/Contents/MacOS/Blender -b --python tools/convert-damas.py -- "<folder>/damas mk2.obj" "<folder>/damas.glb"
import bpy, sys
src, out = sys.argv[sys.argv.index("--") + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=src, forward_axis='NEGATIVE_Z', up_axis='Y')
for n in [o.name for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith(("Disk", "Nipel", "Rezina", "Окружность"))]:
    bpy.ops.object.select_all(action='DESELECT')
    o = bpy.data.objects[n]; bpy.context.view_layer.objects.active = o; o.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
# the tyre rubber is an unnamed default-looking material that the glTF tools would merge with others
# of the same values: give it its own name and colour
m = bpy.data.materials.get("Материал.001")
if m:
    m.name = "tyre_rubber"
    if m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                n.inputs["Base Color"].default_value = (0.04, 0.04, 0.045, 1); n.inputs["Roughness"].default_value = 0.9
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True)
