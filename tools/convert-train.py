# Converts the downloaded "Little train" OBJ (from 2rgrkemeyv-Littletrain.rar) to a GLB with Blender.
# The geometry is far too heavy for the browser: tools/make-train.mjs then simplifies it and packs the textures.
#
#   bsdtar -xf 2rgrkemeyv-Littletrain.rar        (in an empty folder)
#   the .mtl names its pictures "Bronze0_1.jpg" but the files are "Bronze0.jpg": strip the "_<n>" before "." in the map_Kd lines
#   /Applications/Blender.app/Contents/MacOS/Blender -b --python tools/convert-train.py -- "<folder>/Little train/Small train.obj" "<folder>/train-raw.glb"
import bpy, sys
src, out = sys.argv[sys.argv.index("--") + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=src, forward_axis='NEGATIVE_Z', up_axis='Y')
# the cab-side plate (material vlc75SIM) carries a Third Reich eagle emblem: keep the plate, blank the picture
m = bpy.data.materials.get("vlc75SIM")
if m and m.use_nodes:
    for n in list(m.node_tree.nodes):
        if n.type == 'TEX_IMAGE': m.node_tree.nodes.remove(n)
    for n in m.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED': n.inputs["Base Color"].default_value = (0.03, 0.03, 0.035, 1)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
import math
from mathutils import Vector
# the model stands at about 45 degrees in the plan: turn it so the nose (the side of the chimney) points along +x,
# with the middle of the wheels at the origin; 1 unit of the file is 0.1 m
o = meshes[0]
pts = [o.matrix_world @ v.co for v in o.data.vertices]
cx = sum(p.x for p in pts) / len(pts); cy = sum(p.y for p in pts) / len(pts)
sxx = sum((p.x - cx) ** 2 for p in pts); syy = sum((p.y - cy) ** 2 for p in pts); sxy = sum((p.x - cx) * (p.y - cy) for p in pts)
ang = 0.5 * math.atan2(2 * sxy, sxx - syy)
top = max(pts, key=lambda p: p.z)
if (top.x - cx) * math.cos(ang) + (top.y - cy) * math.sin(ang) < 0: ang += math.pi
print("TRAIN_YAW", math.degrees(ang))
bpy.context.view_layer.objects.active = o
o.select_set(True)
o.location = (0, 0, 0)
for v in o.data.vertices:
    p = o.matrix_world @ v.co
    x, y = p.x - cx, p.y - cy
    v.co = Vector((x * math.cos(-ang) - y * math.sin(-ang), x * math.sin(-ang) + y * math.cos(-ang), p.z)) * 0.1
o.matrix_world.identity()
lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        lo = Vector((min(lo[i], w[i]) for i in range(3))); hi = Vector((max(hi[i], w[i]) for i in range(3)))
print("TRAIN_BBOX", tuple(lo), tuple(hi), len(meshes), "meshes", sum(len(o.data.polygons) for o in meshes), "polys")
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True)
