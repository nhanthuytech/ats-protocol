# Contributing to ATS Protocol

Thanks for your interest in contributing to ATS!

## Getting Started

1. Fork the repository.
2. Clone your fork locally.
3. Navigate to the Flutter SDK package:
   ```bash
   cd packages/ats_flutter
   flutter pub get
   ```

## Project Structure

```
ats-protocol/
├── spec/              # Protocol specification (language-agnostic)
├── skills/            # AI agent skill files
│   ├── antigravity/   # Skill for Antigravity (Gemini) agents
│   └── claude/        # Skill for Claude agents
├── packages/
│   └── ats_flutter/   # Dart/Flutter SDK + CLI
└── docs/              # Setup guides and documentation
```

## Development

### Running Tests

```bash
cd packages/ats_flutter
flutter test
```

### Analyzing Code

```bash
cd packages/ats_flutter
dart analyze
```

### Formatting

```bash
cd packages/ats_flutter
dart format lib test
```

## What to Contribute

- **Bug fixes** — If you find a bug in the SDK or CLI, open an issue or submit a PR.
- **New language SDKs** — Add a new package under `packages/` (e.g. `ats_node`, `ats_python`). Follow the protocol spec in `spec/protocol.md`.
- **Skill files** — Add support for new AI agents under `skills/`.
- **Documentation** — Improvements to docs are always welcome.

## Pull Request Guidelines

1. Keep PRs focused — one feature or fix per PR.
2. Run `dart analyze` and `flutter test` before submitting.
3. Update documentation if your change affects the public API or CLI.
4. Follow existing code style.

## Reporting Issues

When filing an issue, please include:
- ATS version (`ats --version`)
- Flutter version (`flutter --version`)
- Steps to reproduce
- Expected vs actual behavior

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
