import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/config/app_config.dart';
import '../../core/theme/tokens.dart';
import '../../state/auth_store.dart';
import '../../widgets/brand_mark.dart';
import '../../widgets/fields.dart';
import '../../widgets/ui.dart';

/// Name + PIN, the same gate the shop-floor site has.
///
/// The supervisor login and nothing else: the back office signs in on the
/// website, and so does the lab. An account that gets past this and has no
/// business here is turned round by [AuthStore.login] with a line saying where
/// its work actually is.
class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _name = TextEditingController();
  final _pin = TextEditingController();

  @override
  void dispose() {
    _name.dispose();
    _pin.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final auth = context.read<AuthStore>();
    if (_name.text.trim().isEmpty || _pin.text.isEmpty) return;
    await auth.login(_name.text, _pin.text);
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthStore>();
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const _BrandPlate(),
                  const SizedBox(height: 22),
                  Text(
                    AppConfig.appName,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Supervisor · sign in with your name and PIN',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12.5, color: T.inkFaint),
                  ),
                  const SizedBox(height: 22),
                  Panel(
                    child: Column(
                      children: [
                        TextFieldRow(
                          controller: _name,
                          label: 'Name',
                          placeholder: 'your name',
                          onChanged: (_) => auth.clearError(),
                        ),
                        TextFieldRow(
                          controller: _pin,
                          label: 'PIN',
                          placeholder: '••••',
                          integer: true,
                          obscure: true,
                          maxLength: 6,
                          onChanged: (_) => auth.clearError(),
                          onSubmitted: (_) => _submit(),
                        ),
                        if (auth.error != null) ...[
                          FormWarning([auth.error!]),
                          const SizedBox(height: 2),
                        ],
                        AppButton(
                          label: 'Sign in',
                          variant: ButtonVariant.primary,
                          expand: true,
                          loading: auth.status == AuthStatus.loading,
                          onPressed: _submit,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Quality, the back office and the customer records stay on '
                    'the Manna website.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 11,
                      height: 1.5,
                      color: T.inkFaint,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The company mark. The tile keeps Manna's green - it is the company's
/// identity, not a theme colour - and the wordmark beside it follows the theme.
class _BrandPlate extends StatelessWidget {
  const _BrandPlate();

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      const BrandMark(size: 46),
      const SizedBox(width: 12),
      const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Manna',
            style: TextStyle(
              fontSize: 21,
              fontWeight: FontWeight.w800,
              color: T.ink,
              height: 1.1,
            ),
          ),
          Text(
            'PRODUCTION MGMT',
            style: TextStyle(
              fontSize: 8.5,
              letterSpacing: 2,
              fontWeight: FontWeight.w700,
              color: T.inkFaint,
            ),
          ),
        ],
      ),
    ],
  );
}
