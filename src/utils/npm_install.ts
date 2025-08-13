import { execSync } from 'child_process';

/**
 * 异步安装并加载依赖，自动推断类型
 * @param pkg 包名
 * @param version 版本号（可选）
 */
export function npm_install(pkg: string, version?: string) {
  const fullName = version ? `${pkg}@${version}` : pkg;

  try {
    require.resolve(pkg);
    console.log(`Package "${pkg}" is already installed.`);
  } catch {
    console.log(`Installing ${fullName}...`);
    execSync(`npm install ${fullName}`, { stdio: 'inherit' });
  }
}