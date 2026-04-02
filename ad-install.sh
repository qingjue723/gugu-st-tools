#!/bin/bash

# Copyright (c) 2025 清绝 (QingJue) <blog.qjyg.de>
# This script is licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License.
# To view a copy of this license, visit http://creativecommons.org/licenses/by-nc-sa/4.0/
#
# 郑重声明：
# 本脚本为免费开源项目，仅供个人学习和非商业用途使用。
# 未经作者授权，严禁将本脚本或其修改版本用于任何形式的商业盈利行为（包括但不限于倒卖、付费部署服务等）。
# 任何违反本协议的行为都将受到法律追究。

SOURCE_MANIFEST_URL="https://gugu.qjyg.de/source-manifest.json"
SCRIPT_MANIFEST_KEY="ad_st"
FILENAME="ad-st.sh"

fn_get_manifest_value() {
  local key="$1"
  local content value

  if ! content="$(curl -fsSL "${SOURCE_MANIFEST_URL}")"; then
    echo "哎呀，获取发布源清单失败了。检查下网络或者域名服务？"
    exit 1
  fi

  value="$(printf '%s' "${content}" | tr -d '\r\n' | sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p")"
  if [ -z "${value}" ]; then
    echo "哎呀，发布源清单里缺少字段：${key}"
    exit 1
  fi

  printf '%s' "${value}"
}

echo "正在准备下载最新版的 ${FILENAME} 脚本..."

SCRIPT_URL="$(fn_get_manifest_value "${SCRIPT_MANIFEST_KEY}")"

curl -fsSL -o "${FILENAME}" "${SCRIPT_URL}"

if [ $? -ne 0 ]; then
  echo "哎呀，下载失败了。检查下网络或者链接？"
  exit 1
fi

chmod +x "${FILENAME}"

echo "脚本准备好了！马上运行..."
echo "------------------------------------"

./"${FILENAME}" "$@" < /dev/tty
