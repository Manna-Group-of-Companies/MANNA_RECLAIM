import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme/tokens.dart';
import '../../state/auth_store.dart';
import '../../state/runs_store.dart';
import '../../state/stores.dart';
import '../../state/ui_store.dart';
import '../../widgets/brand_mark.dart';
import '../../widgets/ui.dart';
import '../batches/batches_page.dart';
import '../bearing/bearing_page.dart';
import '../history/history_page.dart';
import '../machines/machines_page.dart';
import '../packing/packing_page.dart';
import '../settings/settings_page.dart';
import '../stock/stock_page.dart';
import '../weigh/weigh_page.dart';

/// The shell: the sticky plate at the top, the tab bar at the bottom, and the
/// toast dock over both.
///
/// A port of UserLayout + BottomTabs + Header. The counts behind the tab badges
/// are loaded here rather than on each tab, so a supervisor sitting on Machines
/// still sees that three runs are waiting to be weighed. Badges are the whole
/// point of the bar: they are how the crew knows there is work waiting on a tab
/// they are not looking at.
///
/// Two things are deliberately not in this list.
///
/// Quality is the lab's page and stays in the React website - a supervisor
/// never had it on the web either, so nothing is lost here that was theirs.
///
/// Reports is gone from this app entirely: the seven-day production headline
/// and the lab's pass rates are a reading exercise rather than shop-floor work,
/// and they are still on the website for whoever wants them. Nothing else
/// depended on it - the run history's own pickers come off `/reports/filters`,
/// which is a different call and still made.
class SupervisorShell extends StatefulWidget {
  const SupervisorShell({super.key});

  @override
  State<SupervisorShell> createState() => _SupervisorShellState();
}

enum _Badge { weigh, packing, bearing }

class _Tab {
  const _Tab(this.label, this.icon, this.page, {this.badge});
  final String label;
  final IconData icon;
  final Widget page;
  final _Badge? badge;
}

class _SupervisorShellState extends State<SupervisorShell> {
  int _index = 0;

  static const _tabs = <_Tab>[
    _Tab('Machines', Icons.grid_view_rounded, MachinesPage()),
    _Tab('Batches', Icons.layers_rounded, BatchesPage()),
    _Tab('Weigh', Icons.monitor_weight_outlined, WeighPage(), badge: _Badge.weigh),
    _Tab('Packing', Icons.inventory_2_outlined, PackingPage(), badge: _Badge.packing),
    _Tab('Stock', Icons.local_shipping_outlined, StockPage()),
    _Tab('History', Icons.history_rounded, HistoryPage()),
    _Tab('Bearing', Icons.thermostat_rounded, BearingPage(), badge: _Badge.bearing),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadBadgeCounts());
  }

  /// What the badges count, read once at the shell rather than per tab.
  void _loadBadgeCounts() {
    context.read<MachinesStore>().fetch();
    final runs = context.read<RunsStore>();
    runs.fetchActive();
    runs.fetchPendingWeigh();
    runs.fetchPendingPack();
    context.read<MaintenanceStore>().fetchDue();
  }

  @override
  Widget build(BuildContext context) {
    final runs = context.watch<RunsStore>();
    final maintenance = context.watch<MaintenanceStore>();

    int countFor(_Badge? badge) => switch (badge) {
      _Badge.weigh => runs.pendingWeigh.length,
      _Badge.packing => runs.pendingPack.length,
      _Badge.bearing => maintenance.overdueCount,
      null => 0,
    };

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            const _Plate(),
            Expanded(
              child: Stack(
                children: [
                  // Every tab stays built, which is what makes switching
                  // between them instant on a tablet - a crew moving from the
                  // machine they just stopped to the Weigh queue should not
                  // wait for a screen to be assembled again.
                  //
                  // The cost is that a tab nobody is looking at goes on doing
                  // whatever it does: the machine cards' run timers fire every
                  // second, the yard re-reads itself every thirty. That work
                  // lands on whatever the crew is actually touching. TickerMode
                  // is the framework's own signal for "this subtree is not being
                  // watched", and the two pages with a clock in them read it.
                  IndexedStack(
                    index: _index,
                    children: [
                      for (var i = 0; i < _tabs.length; i++)
                        TickerMode(
                          enabled: i == _index,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 14),
                            child: _tabs[i].page,
                          ),
                        ),
                    ],
                  ),
                  const Positioned(
                    left: 12,
                    right: 12,
                    bottom: 12,
                    child: _ToastDock(),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          for (final tab in _tabs)
            NavigationDestination(
              icon: _TabIcon(icon: tab.icon, count: countFor(tab.badge)),
              selectedIcon: _TabIcon(
                icon: tab.icon,
                count: countFor(tab.badge),
                selected: true,
              ),
              label: tab.label,
            ),
        ],
      ),
    );
  }
}

class _TabIcon extends StatelessWidget {
  const _TabIcon({
    required this.icon,
    required this.count,
    this.selected = false,
  });

  final IconData icon;
  final int count;
  final bool selected;

  @override
  Widget build(BuildContext context) => Stack(
    clipBehavior: Clip.none,
    children: [
      Icon(icon, size: 22, color: selected ? T.brand : T.inkDim),
      if (count > 0)
        Positioned(
          right: -8,
          top: -6,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
            decoration: BoxDecoration(
              color: T.ember,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              '$count',
              style: const TextStyle(
                fontSize: 9.5,
                fontWeight: FontWeight.w800,
                color: T.onFill,
              ),
            ),
          ),
        ),
    ],
  );
}

/// The sticky plate: who is signed in, whether the device is on the network,
/// how many machines are turning, and the way out to Settings.
class _Plate extends StatelessWidget {
  const _Plate();

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthStore>();
    final ui = context.watch<UiStore>();
    final running = context.watch<RunsStore>().active.length;

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 8, 6, 8),
      decoration: const BoxDecoration(
        color: T.bg2,
        border: Border(bottom: BorderSide(color: T.line)),
      ),
      child: Row(
        children: [
          const BrandMark(size: 30),
          const SizedBox(width: 10),
          Text(
            auth.user?.role ?? 'shop floor',
            style: const TextStyle(
              fontSize: 10.5,
              letterSpacing: 1,
              fontWeight: FontWeight.w700,
              color: T.inkFaint,
            ),
          ),
          const Spacer(),
          if (!ui.online) ...[
            const StatePill('Offline', tone: PillTone.warn),
            const SizedBox(width: 8),
          ],
          Text(
            '$running running',
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
              color: running > 0 ? T.ok : T.inkFaint,
            ),
          ),
          IconButton(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const SettingsPage()),
            ),
            icon: const Icon(Icons.settings_outlined, size: 20),
            color: T.inkDim,
            tooltip: 'Settings',
          ),
        ],
      ),
    );
  }
}

/// The toast stack. Sits above the tab bar so it never covers it.
class _ToastDock extends StatelessWidget {
  const _ToastDock();

  @override
  Widget build(BuildContext context) {
    final toasts = context.watch<UiStore>().toasts;
    if (toasts.isEmpty) return const SizedBox.shrink();
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final toast in toasts)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
              decoration: BoxDecoration(
                color: switch (toast.kind) {
                  ToastKind.ok => T.tOkBg,
                  ToastKind.warn => T.tWarnBg,
                  ToastKind.err => T.tErrBg,
                },
                borderRadius: BorderRadius.circular(T.radiusSm),
                border: Border.all(
                  color: switch (toast.kind) {
                    ToastKind.ok => T.tOkLine,
                    ToastKind.warn => T.tWarnLine,
                    ToastKind.err => T.tErrLine,
                  },
                ),
              ),
              child: Text(
                toast.message,
                style: TextStyle(
                  fontSize: 12.5,
                  height: 1.4,
                  color: switch (toast.kind) {
                    ToastKind.ok => T.ok,
                    ToastKind.warn => T.warn,
                    ToastKind.err => T.err,
                  },
                ),
              ),
            ),
          ),
      ],
    );
  }
}
