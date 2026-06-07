import os

with open("input.txt", "r") as f:
    i = 0
    for l in f:
        l = l.rstrip("\r\n")
        if l.startswith("´´´"):
            if i == 0:
                filename = l[4:]
                # 自动创建目录
                dirname = os.path.dirname(filename)
                if dirname and not os.path.exists(dirname):
                    os.makedirs(dirname)
                g = open(filename, "w")
                i = 1
            else:
                g.close()
                print(filename)
                i = 0
        else:
            if i == 1:
                g.write(l + "\n")

open("input.txt", "w")