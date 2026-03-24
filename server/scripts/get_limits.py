#!/usr/bin/env python3
import json
import os
import sys

PIXAZO_PATH = os.environ.get('PIXAZO_PATH', '/home/ambsd/Desktop/aceui/Pixazo')
sys.path.insert(0, PIXAZO_PATH)

from acestep.gpu_config import get_gpu_config


def main():
    cfg = get_gpu_config()
    print(json.dumps({
        "tier": cfg.tier,
        "gpu_memory_gb": cfg.gpu_memory_gb,
        "max_duration_with_lm": cfg.max_duration_with_lm,
        "max_duration_without_lm": cfg.max_duration_without_lm,
        "max_batch_size_with_lm": cfg.max_batch_size_with_lm,
        "max_batch_size_without_lm": cfg.max_batch_size_without_lm,
    }))


if __name__ == "__main__":
    main()
