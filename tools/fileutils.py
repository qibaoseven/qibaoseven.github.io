# ========================================
# StudentOS v0.44
# Author: github@qibaoseven, bilibili@七宝-Seven
# ========================================
#!/usr/bin/env python3
"""
文件处理程序 - 根据指令文件执行完全删除或完全覆盖操作
指令文件格式：
    # 注释行
    delete /path/to/file
    overwrite /path/to/target/file --- 可选的多行内容
    第一行内容
    第二行内容
    --- 结束标记
"""

import os
import sys
import shutil
import argparse
from pathlib import Path

def parse_instruction_file(instruction_path):
    """
    解析指令文件，返回指令列表
    每条指令格式：('delete', 路径) 或 ('overwrite', 路径, 内容列表)
    """
    instructions = []
    current_overwrite = None
    current_content = []
    
    with open(instruction_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    i = 0
    while i < len(lines):
        line = lines[i].rstrip('\n')
        
        # 跳过空行和注释行
        if not line.strip() or line.lstrip().startswith('#'):
            i += 1
            continue
        
        # 处理 delete 指令
        if line.strip().startswith('delete '):
            parts = line.strip().split(maxsplit=1)
            if len(parts) != 2:
                print(f"警告: 无效的 delete 指令格式: {line}")
                i += 1
                continue
            target_path = parts[1]
            instructions.append(('delete', target_path))
            i += 1
        
        # 处理 overwrite 指令开始
        elif line.strip().startswith('overwrite '):
            parts = line.strip().split(maxsplit=1)
            if len(parts) != 2:
                print(f"警告: 无效的 overwrite 指令格式: {line}")
                i += 1
                continue
            target_path = parts[1]
            current_overwrite = target_path
            current_content = []
            i += 1
            
            # 读取 overwrite 内容直到结束标记 '---'
            while i < len(lines):
                content_line = lines[i].rstrip('\n')
                # 结束标记必须单独一行，且为 '---' 或 '--- ' 后跟空白
                if content_line.strip() == '---':
                    instructions.append(('overwrite', current_overwrite, current_content))
                    current_overwrite = None
                    current_content = None
                    i += 1
                    break
                # 保留空行，仅跳过注释（但注释作为内容？规范：内容中的注释不被解析）
                # 按设计，overwrite内容中的行原样保留，不解析注释符
                current_content.append(content_line)
                i += 1
            else:
                # 文件结束没有找到结束标记
                print(f"错误: overwrite 指令缺少结束标记 '---'，目标: {current_overwrite}")
                sys.exit(1)
        
        else:
            print(f"警告: 忽略无效行: {line}")
            i += 1
    
    return instructions

def execute_instructions(instructions, dry_run=False):
    """
    执行指令列表
    dry_run=True 时仅打印将要执行的操作
    """
    results = {'deleted': 0, 'overwritten': 0, 'errors': []}
    
    for instr in instructions:
        if instr[0] == 'delete':
            _, target = instr
            if dry_run:
                print(f"[DRY RUN] 将删除: {target}")
                results['deleted'] += 1
                continue
            
            try:
                path = Path(target)
                if not path.exists():
                    print(f"警告: 删除目标不存在: {target}")
                    continue
                if path.is_file():
                    os.remove(target)
                    print(f"已删除文件: {target}")
                    results['deleted'] += 1
                elif path.is_dir():
                    shutil.rmtree(target)
                    print(f"已删除目录: {target}")
                    results['deleted'] += 1
                else:
                    print(f"错误: 无法删除特殊文件: {target}")
                    results['errors'].append(target)
            except Exception as e:
                print(f"删除失败 {target}: {e}")
                results['errors'].append(target)
        
        elif instr[0] == 'overwrite':
            _, target, content = instr
            if dry_run:
                print(f"[DRY RUN] 将覆盖文件: {target}，内容行数: {len(content)}")
                results['overwritten'] += 1
                continue
            
            try:
                path = Path(target)
                # 确保目标目录存在
                path.parent.mkdir(parents=True, exist_ok=True)
                # 写入文件，完全覆盖
                with open(target, 'w', encoding='utf-8') as f:
                    for line in content:
                        f.write(line + '\n')
                print(f"已覆盖文件: {target}")
                results['overwritten'] += 1
            except Exception as e:
                print(f"覆盖失败 {target}: {e}")
                results['errors'].append(target)
    
    return results

def main():
    parser = argparse.ArgumentParser(
        description='根据指令文件执行文件删除或完全覆盖操作。'
                    '指令格式: delete <路径> 或 overwrite <路径>\\n...内容...\\n---'
    )
    parser.add_argument('instruction_file', help='指令文件的路径')
    parser.add_argument('--dry-run', action='store_true', 
                        help='模拟运行，不实际执行操作')
    parser.add_argument('--no-backup', action='store_true', default=True,
                        help='不创建备份（默认行为，因为操作要么删除要么覆盖）')
    
    args = parser.parse_args()
    
    # 检查指令文件是否存在
    if not os.path.isfile(args.instruction_file):
        print(f"错误: 指令文件不存在: {args.instruction_file}")
        sys.exit(1)
    
    # 解析指令
    try:
        instructions = parse_instruction_file(args.instruction_file)
    except Exception as e:
        print(f"解析指令文件失败: {e}")
        sys.exit(1)
    
    if not instructions:
        print("警告: 未找到任何有效指令")
        return
    
    # 显示指令概要
    print(f"共解析到 {len(instructions)} 条指令")
    if args.dry_run:
        print("*** 模拟运行模式，不会实际修改文件 ***")
    
    # 执行指令
    results = execute_instructions(instructions, dry_run=args.dry_run)
    
    # 输出结果摘要
    print("\n=== 执行摘要 ===")
    if args.dry_run:
        print(f"模拟删除: {results['deleted']} 个")
        print(f"模拟覆盖: {results['overwritten']} 个")
    else:
        print(f"实际删除: {results['deleted']} 个")
        print(f"实际覆盖: {results['overwritten']} 个")
    
    if results['errors']:
        print(f"错误数: {len(results['errors'])}")
        for err in results['errors']:
            print(f"  - {err}")
        sys.exit(1)
    else:
        print("所有操作成功完成")

if __name__ == '__main__':
    main()
