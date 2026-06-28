const DEFAULT_PROVIDER = 'github';
const MAINLAND_PROVIDER = 'gitee';
const MAINLAND_COUNTRY_CODE = 'CN';

const PROVIDERS = {
  gitee: {
    templatesBase: 'https://gitee.com/api/v5/repos/canaan723/gugu-templates/contents',
    templatesKind: 'gitee-api',
    files: {
      ad_install: {
        kind: 'gitee-api',
        url: 'https://gitee.com/api/v5/repos/canaan723/st-tools/contents/ad-install.sh?ref=main',
        filename: 'ad-install.sh'
      },
      ad_install_test: {
        kind: 'gitee-api',
        url: 'https://gitee.com/api/v5/repos/canaan723/st-tools/contents/ad-install-test.sh?ref=main',
        filename: 'ad-install-test.sh'
      },
      ad_st: {
        kind: 'gitee-api',
        url: 'https://gitee.com/api/v5/repos/canaan723/st-tools/contents/ad-st.sh?ref=main',
        filename: 'ad-st.sh'
      },
      ad_st_test: {
        kind: 'gitee-api',
        url: 'https://gitee.com/api/v5/repos/canaan723/st-tools/contents/ad-st-test.sh?ref=main',
        filename: 'ad-st-test.sh'
      },
      dckr_st: {
        kind: 'gitee-api',
        url: 'https://gitee.com/api/v5/repos/canaan723/st-tools/contents/dckr-st.sh?ref=main',
        filename: 'dckr-st.sh'
      },
      dckr_st_test: {
        kind: 'gitee-api',
        url: 'https://gitee.com/api/v5/repos/canaan723/st-tools/contents/dckr-st-test.sh?ref=main',
        filename: 'dckr-st-test.sh'
      },
      pc_st: {
        kind: 'gitee-api',
        url: 'https://gitee.com/api/v5/repos/canaan723/st-tools/contents/jiuguan/pc-st.ps1?ref=main',
        filename: 'pc-st.ps1'
      }
    },
    repos: {
      st_tools: 'https://gitee.com/canaan723/st-tools.git',
      gugu_transit_manager: 'https://gitee.com/canaan723/gugu-transit-manager.git',
      gugu_transit_manager_plugin: 'https://gitee.com/canaan723/gugu-transit-manager-plugin.git'
    }
  },
  github: {
    templatesBase: 'https://raw.githubusercontent.com/qingjue723/gugu-templates/main',
    templatesKind: 'direct',
    files: {
      ad_install: {
        kind: 'direct',
        url: 'https://raw.githubusercontent.com/qingjue723/gugu-st-tools/main/ad-install.sh',
        filename: 'ad-install.sh'
      },
      ad_install_test: {
        kind: 'direct',
        url: 'https://raw.githubusercontent.com/qingjue723/gugu-st-tools/main/ad-install-test.sh',
        filename: 'ad-install-test.sh'
      },
      ad_st: {
        kind: 'direct',
        url: 'https://raw.githubusercontent.com/qingjue723/gugu-st-tools/main/ad-st.sh',
        filename: 'ad-st.sh'
      },
      ad_st_test: {
        kind: 'direct',
        url: 'https://raw.githubusercontent.com/qingjue723/gugu-st-tools/main/ad-st-test.sh',
        filename: 'ad-st-test.sh'
      },
      dckr_st: {
        kind: 'direct',
        url: 'https://raw.githubusercontent.com/qingjue723/gugu-st-tools/main/dckr-st.sh',
        filename: 'dckr-st.sh'
      },
      dckr_st_test: {
        kind: 'direct',
        url: 'https://raw.githubusercontent.com/qingjue723/gugu-st-tools/main/dckr-st-test.sh',
        filename: 'dckr-st-test.sh'
      },
      pc_st: {
        kind: 'direct',
        url: 'https://raw.githubusercontent.com/qingjue723/gugu-st-tools/main/jiuguan/pc-st.ps1',
        filename: 'pc-st.ps1'
      }
    },
    repos: {
      st_tools: 'https://github.com/qingjue723/gugu-st-tools.git',
      gugu_transit_manager: 'https://github.com/qingjue723/gugu-transit-manager.git',
      gugu_transit_manager_plugin: 'https://github.com/qingjue723/gugu-transit-manager-plugin.git'
    }
  }
};

// 预计算：每个 provider 的 manifest 和路由表
const MANIFESTS = {};
const SCRIPT_MAPPINGS = {};

for (const [providerName, config] of Object.entries(PROVIDERS)) {
  MANIFESTS[providerName] = {
    version: 1,
    provider: providerName,
    raw: {
      ad_install: `/{provider_placeholder}/`,
      ad_install_test: `/{provider_placeholder}/test`,
      ad_st: `/{provider_placeholder}/ad`,
      ad_st_test: `/{provider_placeholder}/adtest`,
      dckr_st: `/{provider_placeholder}/vps`,
      dckr_st_test: `/{provider_placeholder}/vpstest`,
      pc_st: `/{provider_placeholder}/pcst`
    },
    repos: config.repos
  };

  SCRIPT_MAPPINGS[providerName] = new Map([
    ['/', config.files.ad_install],
    ['/ad', config.files.ad_st],
    ['/test', config.files.ad_install_test],
    ['/adtest', config.files.ad_st_test],
    ['/vps', config.files.dckr_st],
    ['/vpstest', config.files.dckr_st_test],
    ['/pcst', config.files.pc_st]
  ]);
}

function resolveProvider(request) {
  const countryCode = (request.headers.get('CF-IPCountry') || '').toUpperCase();
  return countryCode === MAINLAND_COUNTRY_CODE ? MAINLAND_PROVIDER : DEFAULT_PROVIDER;
}

function buildManifest(provider, origin) {
  const manifest = { ...MANIFESTS[provider] };
  manifest.raw = {};
  for (const [key, template] of Object.entries(MANIFESTS[provider].raw)) {
    manifest.raw[key] = template.replace('/{provider_placeholder}/', `${origin}/`);
  }
  return manifest;
}

const BROWSER_PATTERN = /mozilla|chrome|safari|firefox|edge|opera|trident|webkit|gecko/i;
function isCliRequest(userAgent) {
  // 不是常见浏览器 → 视为 CLI 工具
  return !BROWSER_PATTERN.test(userAgent || '');
}

function decodeBase64ToBytes(base64Content) {
  const normalized = base64Content.replace(/\s+/g, '');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function fetchScriptPayload(target) {
  if (target.kind === 'direct') {
    const upstream = await fetch(target.url);
    return {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
      body: upstream.body,
      filename: target.filename
    };
  }

  if (target.kind === 'gitee-api') {
    const upstream = await fetch(target.url, {
      headers: { Accept: 'application/json' }
    });

    if (!upstream.ok) {
      return {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: upstream.headers,
        body: upstream.body,
        filename: target.filename
      };
    }

    const payload = await upstream.json();
    const rawContent = payload.content;

    if (!rawContent) {
      return {
        status: 502,
        statusText: 'Bad Gateway',
        headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' }),
        body: new TextEncoder().encode('Error: Gitee API returned empty content.'),
        filename: target.filename
      };
    }

    const bytes = decodeBase64ToBytes(rawContent);
    const headers = new Headers({
      'Content-Type': 'text/plain; charset=utf-8'
    });

    return {
      status: 200,
      statusText: 'OK',
      headers,
      body: bytes,
      filename: target.filename
    };
  }

  throw new Error(`Unsupported target kind: ${target.kind}`);
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const provider = resolveProvider(request);
    const providerConfig = PROVIDERS[provider];

    // /source-manifest.json
    if (path === '/source-manifest.json') {
      const manifest = buildManifest(provider, url.origin);
      return new Response(JSON.stringify(manifest, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-cache'
        }
      });
    }

    // /templates/{app}/{file} — 模板文件代理（CLI 检查前，允许脚本 curl 访问）
    if (path.startsWith('/templates/')) {
      const parts = path.replace('/templates/', '');
      if (!parts || parts.split('/').length !== 2) {
        return new Response('Error: Invalid template path. Expected /templates/{app}/{file}', {
          status: 400,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }

      const target = {
        kind: providerConfig.templatesKind,
        url: `${providerConfig.templatesBase}/${parts}?ref=main`,
        filename: parts.split('/').pop()
      };

      const payload = await fetchScriptPayload(target);
      const headers = new Headers(payload.headers);
      headers.set('Content-Disposition', `attachment; filename="${payload.filename}"`);

      return new Response(payload.body, {
        status: payload.status,
        statusText: payload.statusText,
        headers
      });
    }

    // 非 CLI 请求重定向到博客
    if (!isCliRequest(request.headers.get('User-Agent'))) {
      return Response.redirect('https://blog.qjyg.de', 302);
    }

    // 脚本路由
    const scriptMappings = SCRIPT_MAPPINGS[provider];
    if (!scriptMappings.has(path)) {
      const available = Array.from(scriptMappings.keys()).concat(
        '/source-manifest.json', '/templates/{app}/{file}'
      );
      return new Response(
        'Error: Script not found for this path.\nAvailable paths are: ' + available.join(', '),
        { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
      );
    }

    const target = scriptMappings.get(path);
    const payload = await fetchScriptPayload(target);
    const headers = new Headers(payload.headers);
    headers.set('Content-Disposition', `attachment; filename="${payload.filename}"`);

    return new Response(payload.body, {
      status: payload.status,
      statusText: payload.statusText,
      headers
    });
  }
};
