import os
import json
import sys

cdn_domain = os.environ.get('CDN_DOMAIN', '')
if not cdn_domain:
    print("ERROR: CDN_DOMAIN environment variable is not set", file=sys.stderr)
    sys.exit(1)

temp_oss_dir = 'temp_oss'
downloads_dir = 'downloads/download'

image_map = {}

# 1. 扫描已下载的图片，建立映射: image_map[model_id][partition_id] = [CDN URLs]
# 注意：仅处理本次实际下载的文件（MD5 有变化的），跳过的文件不在此目录中
if os.path.exists(downloads_dir):
    for root, dirs, files in os.walk(downloads_dir):
        for file in files:
            if not file.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp')):
                continue
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, 'downloads').replace('\\', '/')
            parts = rel_path.split('/')
            try:
                if 'images' not in parts:
                    continue
                img_idx = parts.index('images')
                model_id = parts[img_idx + 1]
                part_folder = parts[img_idx + 2]
                if not part_folder.startswith('partition_'):
                    continue
                part_id = int(part_folder.split('_')[1])
                image_map.setdefault(model_id, {}).setdefault(part_id, [])
                image_map[model_id][part_id].append(f"https://{cdn_domain}/{rel_path}")
            except Exception as e:
                print(f"  [警告] 解析图片路径失败: {full_path} — {e}", file=sys.stderr)


# 2. 递归查找并注入图片到空的 pics 数组中
def inject_images_recursive(obj, model_id):
    modified = False
    if isinstance(obj, dict):
        if 'partitions' in obj and isinstance(obj['partitions'], list):
            for partition in obj['partitions']:
                if not isinstance(partition, dict):
                    continue
                part_id = partition.get('id')
                if part_id is not None and not partition.get('pics'):
                    if model_id in image_map and part_id in image_map[model_id]:
                        partition['pics'] = sorted(image_map[model_id][part_id])
                        modified = True
        for v in obj.values():
            if isinstance(v, (dict, list)):
                if inject_images_recursive(v, model_id):
                    modified = True
    elif isinstance(obj, list):
        for item in obj:
            if isinstance(item, (dict, list)):
                if inject_images_recursive(item, model_id):
                    modified = True
    return modified


# 3. 处理所有的 JSON（原本是 .html）文件
detail_dir = os.path.join(temp_oss_dir, 'model', 'detail')
if not os.path.exists(detail_dir):
    print(f"[跳过] detail 目录不存在: {detail_dir}")
    sys.exit(0)

success_count = 0
error_count = 0

for file in os.listdir(detail_dir):
    file_path = os.path.join(detail_dir, file)
    model_id = file
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if inject_images_recursive(data, model_id):
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
            print(f"  -> [成功] 已为 Model ID {model_id} 的空分区注入了图片数据")
            success_count += 1
    except Exception as e:
        print(f"  -> [失败] Model ID {model_id}: {e}", file=sys.stderr)
        error_count += 1

print(f"\n注入完成: 成功 {success_count} 个, 失败 {error_count} 个")
if error_count > 0:
    sys.exit(1)
