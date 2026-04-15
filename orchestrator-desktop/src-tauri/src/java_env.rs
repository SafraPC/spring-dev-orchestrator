use std::ffi::OsStr;
use std::path::PathBuf;
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

pub const MINIMUM_JAVA_MAJOR: u32 = 17;

pub fn apply_no_window(cmd: &mut Command) {
  #[cfg(windows)]
  {
    cmd.creation_flags(CREATE_NO_WINDOW);
  }
}

pub fn prepend_java_home_bin(entries: &mut Vec<PathBuf>) {
  let Ok(raw) = std::env::var("JAVA_HOME") else {
    return;
  };
  let trimmed = raw.trim();
  if trimmed.is_empty() {
    return;
  }
  let bin = PathBuf::from(trimmed).join("bin");
  if bin.is_dir() && !entries.iter().any(|e| e == &bin) {
    entries.insert(0, bin);
  }
}

pub fn parse_java_major_from_version_output(text: &str) -> Option<u32> {
  let lowered = text.to_ascii_lowercase();
  let key = "version \"";
  let idx = lowered.find(key)?;
  let after = text.get(idx + key.len()..)?;
  let end = after.find('"')?;
  let ver = &after[..end];
  let digits: String = if let Some(rest) = ver.strip_prefix("1.") {
    rest.chars().take_while(|c| c.is_ascii_digit()).collect()
  } else {
    ver.chars().take_while(|c| c.is_ascii_digit()).collect()
  };
  if digits.is_empty() {
    return None;
  }
  digits.parse().ok()
}

pub fn java_version_requirement_error(major: Option<u32>, combined_output: &str) -> String {
  let trimmed = combined_output.trim();
  let hint = if trimmed.is_empty() {
    " Saída do java -version vazia. Em Configurações do Windows, desative os aliases java.exe/javac.exe da Microsoft Store e instale JDK 17+ (ex.: Temurin), ou defina JAVA_HOME."
  } else {
    ""
  };
  match major {
    Some(v) if v < MINIMUM_JAVA_MAJOR => format!(
      "Java {v} encontrado. O core exige Java {} ou superior.{hint}",
      MINIMUM_JAVA_MAJOR
    ),
    None => format!(
      "Não foi possível confirmar a versão do Java (precisa {}+).{hint}",
      MINIMUM_JAVA_MAJOR
    ),
    Some(_) => format!(
      "Use JDK {}+ (Temurin) em JAVA_HOME ou nas Configurações do app.{hint}",
      MINIMUM_JAVA_MAJOR
    ),
  }
}

pub fn is_probable_windows_store_stub_path(java_exe: &OsStr) -> bool {
  let Some(s) = java_exe.to_str() else {
    return false;
  };
  let lower = s.to_ascii_lowercase();
  lower.contains("windowsapps")
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parses_modern_java() {
    let t = r#"openjdk version "17.0.9" 2023-10-17"#;
    assert_eq!(parse_java_major_from_version_output(t), Some(17));
  }

  #[test]
  fn parses_java8_style() {
    let t = r#"java version "1.8.0_391""#;
    assert_eq!(parse_java_major_from_version_output(t), Some(8));
  }
}
