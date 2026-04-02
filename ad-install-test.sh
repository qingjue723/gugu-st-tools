#!/bin/bash

SOURCE_MANIFEST_URL="https://gugu.qjyg.de/source-manifest.json"
SCRIPT_MANIFEST_KEY="ad_st_test"
FILENAME="ad-st-test.sh"

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
