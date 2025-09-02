import { Api } from "telegram";

interface PluginParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'flag';
  required: boolean;
  description: string;
  example?: string;
  alias?: string; // 短别名，如 -f
}

interface ParsedArgs {
  args: string[];
  flags: { [key: string]: boolean };
  showHelp: boolean;
}

abstract class Plugin {
  abstract command: string[];
  abstract description?: string; // 可选字段，保持向后兼容
  abstract parameters?: PluginParameter[]; // 可选，保持向后兼容
  abstract cmdHandler: (msg: Api.Message) => Promise<void>;
  abstract listenMessageHandler?: (msg: Api.Message) => Promise<void>;
}

// 参数解析工具函数
function parsePluginArgs(text: string, parameters?: PluginParameter[]): ParsedArgs {
  const args = text.trim().split(/\s+/);
  const result: ParsedArgs = {
    args: [],
    flags: {},
    showHelp: false
  };
  
  // 解析参数，过滤标志
  const filteredArgs = args.slice(1).filter(arg => {
    // 检查帮助命令
    if (arg === 'help' || arg === 'h') {
      result.showHelp = true;
      return false;
    }
    
    // 检查标志参数
    if (parameters) {
      for (const param of parameters) {
        if (param.type === 'flag' && (arg === param.alias || arg === param.name)) {
          result.flags[param.name] = true;
          return false;
        }
      }
    }
    
    // 通用标志检查（向后兼容）
    if (arg.startsWith('-')) {
      const flagName = arg.substring(1);
      result.flags[flagName] = true;
      return false;
    }
    
    return true;
  });
  
  result.args = filteredArgs;
  return result;
}

// 参数验证工具函数
function validatePluginArgs(parsed: ParsedArgs, parameters?: PluginParameter[]): string | null {
  if (!parameters) return null; // 向后兼容：无parameters定义时跳过验证
  
  const requiredParams = parameters.filter(p => p.required && p.type !== 'flag');
  
  for (let i = 0; i < requiredParams.length; i++) {
    const param = requiredParams[i];
    const argValue = parsed.args[i];
    
    if (!argValue) {
      return `缺少必需参数: ${param.name} (${param.description})`;
    }
    
    // 类型验证
    if (param.type === 'number' && isNaN(Number(argValue))) {
      return `参数 ${param.name} 必须是数字`;
    }
  }
  
  return null;
}

// 生成参数帮助文本
function generateParameterHelp(parameters?: PluginParameter[]): string {
  if (!parameters || parameters.length === 0) return "";
  
  const required = parameters.filter(p => p.required);
  const optional = parameters.filter(p => !p.required);
  
  let help = "";
  
  if (required.length > 0) {
    help += "\n\n<b>必需参数:</b>\n";
    for (const param of required) {
      const alias = param.alias ? ` (${param.alias})` : "";
      const example = param.example ? ` 例: ${param.example}` : "";
      help += `• <code>${param.name}</code>${alias} - ${param.description}${example}\n`;
    }
  }
  
  if (optional.length > 0) {
    help += "\n<b>可选参数:</b>\n";
    for (const param of optional) {
      const alias = param.alias ? ` (${param.alias})` : "";
      const example = param.example ? ` 例: ${param.example}` : "";
      help += `• <code>${param.name}</code>${alias} - ${param.description}${example}\n`;
    }
  }
  
  return help;
}

export { Plugin, PluginParameter, ParsedArgs, parsePluginArgs, validatePluginArgs, generateParameterHelp };
