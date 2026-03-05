import type { DocumentCategory } from "./classifier.js";

export function classifyJavaFile(filename: string, content: string): DocumentCategory {
  // 1st priority: annotation-based
  if (/@RestController\b|@Controller\b/.test(content)) return "source_controller";
  if (/@Service\b/.test(content)) return "source_service";
  if (/@Entity\b/.test(content)) return "source_vo";
  if (/@Configuration\b|@Component\b/.test(content)) return "source_config";

  // 2nd priority: filename-based
  if (/Controller\.java$/.test(filename)) return "source_controller";
  if (/(?:VO|Dto|DTO|Entity|Req|Res|Request|Response)\.java$/.test(filename)) return "source_vo";
  if (/(?:Service|ServiceImpl)\.java$/.test(filename)) return "source_service";

  // 3rd: SQL files
  if (filename.endsWith(".sql")) return "source_ddl";

  return "source_config";
}

export function classifySqlFile(_filename: string, _content: string): DocumentCategory {
  return "source_ddl";
}
