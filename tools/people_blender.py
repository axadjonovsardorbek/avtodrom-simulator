# Blender (headless) step of tools/prepare-people.mjs: Mixamo FBX files -> one GLB per person.
#   blender -b --python tools/people_blender.py -- <out.glb> <name> <main.fbx>[:action] [<extra.fbx>:action ...] [--drop regex]
# The first FBX gives the mesh and skeleton; the others only lend their animation.
import bpy, sys, re

args = sys.argv[sys.argv.index("--") + 1:]
drop = None
if "--drop" in args:
    i = args.index("--drop"); drop = re.compile(args[i + 1]); del args[i:i + 2]
out, name, specs = args[0], args[1], args[2:]

def split(spec):
    path, _, act = spec.rpartition(":") if spec.count(":") and not spec.endswith(".fbx") else (spec, "", "")
    return (path or spec), (act or "idle")

bpy.ops.wm.read_factory_settings(use_empty=True)
path, act = split(specs[0])
bpy.ops.import_scene.fbx(filepath=path, use_anim=True)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
arm.name = name
first = arm.animation_data.action
first.name = act; first.use_fake_user = True
keep = set(bpy.data.objects)

for spec in specs[1:]:
    path, act = split(spec)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path, use_anim=True)
    new = [o for o in bpy.data.objects if o not in before]
    a2 = next(o for o in new if o.type == "ARMATURE")
    action = a2.animation_data.action
    action.name = act; action.use_fake_user = True
    for o in new: bpy.data.objects.remove(o, do_unlink=True)

if drop:
    for o in list(bpy.data.objects):
        if o.type == "MESH" and drop.search(o.name): bpy.data.objects.remove(o, do_unlink=True)

# every action as its own glTF animation
arm.animation_data.action = first
for a in bpy.data.actions:
    track = arm.animation_data.nla_tracks.new(); track.name = a.name
    track.strips.new(a.name, int(a.frame_range[0]), a)
arm.animation_data.action = None

bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_animations=True, export_animation_mode="NLA_TRACKS",
                          export_skins=True, export_morph=False, export_apply=False, export_yup=True)
print("EXPORTED", out, [a.name for a in bpy.data.actions])
