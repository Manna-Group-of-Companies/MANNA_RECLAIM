import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/theme/layout.dart';
import '../../core/theme/tokens.dart';
import '../../services/services.dart';
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
import 'tab_navigation.dart';

/// The shell: the sticky plate at the top, the tab bar along the bottom, and
/// the toast dock over both.
///
/// The bar stays at the bottom at every size. A side rail was tried on the
/// tablet - it is what Material suggests for the width, and it buys back the
/// bar's 62 rows of height - and it was taken back out: the crews reach for the
/// tabs at the bottom edge, on the tablet exactly as on the handset, and a
/// plant that has two devices in it wants one app on both. The width a rail
/// would have saved is spent on card columns instead, which is where it does
/// some good - see [ScreenSize].
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

  /// One scroll controller per tab, handed to that tab's subtree as its
  /// [PrimaryScrollController] by [TabScrollScope]. The pages don't build
  /// controllers of their own, so their plain `ListView`s adopt these without
  /// any change on their side.
  late final List<ScrollController> _scrollers = List.generate(
    _tabs.length,
    (_) => ScrollController(),
  );

  /// Reads the bottom bar: which presses are moves, and which pair of them is
  /// the double-tap that means "back to the top".
  final _taps = TabTapReader();

  /// True while a scroll-to-top is playing, so further presses landing on top
  /// of the animation don't stack up on it.
  bool _scrollingToTop = false;

  static const _tabs = <_Tab>[
    _Tab('Machines', Icons.grid_view_rounded, MachinesPage()),
    _Tab('Batches', Icons.layers_rounded, BatchesPage()),
    _Tab(
      'Weigh',
      Icons.monitor_weight_outlined,
      WeighPage(),
      badge: _Badge.weigh,
    ),
    _Tab(
      'Packing',
      Icons.inventory_2_outlined,
      PackingPage(),
      badge: _Badge.packing,
    ),
    _Tab('Stock', Icons.local_shipping_outlined, StockPage()),
    _Tab('History', Icons.history_rounded, HistoryPage()),
    _Tab(
      'Bearing',
      Icons.thermostat_rounded,
      BearingPage(),
      badge: _Badge.bearing,
    ),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadBadgeCounts();
      _loadSigners();
    });
  }

  @override
  void dispose() {
    for (final scroller in _scrollers) {
      scroller.dispose();
    }
    super.dispose();
  }

  /// Every press of the bottom bar comes through here.
  ///
  /// A press on another tab switches to it and nothing else - no scrolling, no
  /// waiting to see whether a second press is coming, so crossing the bar stays
  /// as immediate as it ever was. Only a double-tap on the tab already showing
  /// scrolls; [TabTapReader] holds that rule and the reasoning behind it.
  void _onDestinationSelected(int i) {
    switch (_taps.read(i, _index, DateTime.now())) {
      case TabTap.navigate:
        setState(() => _index = i);
      case TabTap.scrollToTop:
        if (_scrollingToTop) return;
        _scrollingToTop = true;
        scrollTabToTop(
          _scrollers[i],
        ).whenComplete(() => _scrollingToTop = false);
      case TabTap.none:
        break;
    }
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

  /// Who may sign a record, read once at the shell rather than per sheet.
  ///
  /// The Supervisor pick used to offer three names compiled into the app, so a
  /// supervisor renamed or added in the back office never reached the tablet.
  /// It now comes off the plant's accounts, re-read whenever the app is opened
  /// or somebody signs in - which is as often as a list that changes a few
  /// times a year needs re-reading.
  ///
  /// A failure is swallowed on purpose: [UiStore] keeps the last list it read,
  /// so a tablet with no signal opens its sheets with a working pick instead of
  /// an error about something the crew did not ask for.
  Future<void> _loadSigners() async {
    final ui = context.read<UiStore>();
    final users = context.read<UserService>();
    try {
      await ui.setSigners(await users.signers());
    } on ApiException {
      // The list from last time stands.
    }
  }

  @override
  Widget build(BuildContext context) {
    final runs = context.watch<RunsStore>();
    final maintenance = context.watch<MaintenanceStore>();

    final gutter = pageGutter(context.screenSize);

    int countFor(_Badge? badge) => switch (badge) {
      _Badge.weigh => runs.pendingWeigh.length,
      _Badge.packing => runs.pendingPack.length,
      _Badge.bearing => maintenance.overdueCount,
      null => 0,
    };

    return Scaffold(
      body: SafeArea(
        // The bottom inset is the tab bar's to deal with: NavigationBar pads
        // itself past the gesture bar, and doing it here as well would leave a
        // stripe of ground above it.
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
                          child: TabScrollScope(
                            controller: _scrollers[i],
                            child: Padding(
                              padding: EdgeInsets.symmetric(horizontal: gutter),
                              child: _tabs[i].page,
                            ),
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
      // At the bottom on every device, handset and tablet alike. Same order,
      // same badges, same double-tap-to-top.
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: _onDestinationSelected,
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

/// The sticky plate: who is signing this tablet's records, whether the device
/// is on the network, how many machines are turning, and the way out to
/// Settings.
class _Plate extends StatelessWidget {
  const _Plate();

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthStore>();
    final ui = context.watch<UiStore>();
    final running = context.watch<RunsStore>().active.length;
    final supervisor = ui.supervisorName;

    return Container(
      // Lines up with the page gutter below it, whatever size the screen is -
      // the brand mark and the first card on the tab share an edge.
      padding: EdgeInsets.fromLTRB(pageGutter(context.screenSize), 8, 6, 8),
      decoration: const BoxDecoration(
        color: T.bg2,
        border: Border(bottom: BorderSide(color: T.line)),
      ),
      child: Row(
        children: [
          const BrandMark(size: 30),
          const SizedBox(width: 10),

          // Who is on the floor, not who the tablet was signed in as. They are
          // the same on most shifts and the app defaults to it - but a tablet
          // is signed in once and left on the line, and the name that goes on
          // an autoclave load or a set of bearing temperatures is whoever is
          // holding it. That name was only visible inside Settings and inside
          // the sheets that use it, which is to say: at the moment it is too
          // late to notice it is wrong. It says so here, on every tab.
          // Expanded rather than Flexible beside a Spacer: the name should have
          // every pixel the pills and the running count are not using, and a
          // long one should ellipsise only when there is genuinely no room.
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Flexible(
                      child: Text(
                        supervisor.isEmpty ? 'no supervisor set' : supervisor,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: supervisor.isEmpty ? T.inkFaint : T.ink,
                        ),
                      ),
                    ),
                    // Switched away from the account signed in here, and marked
                    // as switched: a name that is not the account's is a
                    // deliberate act at the start of a shift, and it stays put
                    // until somebody changes it back.
                    if (!ui.supervisorIsAccount) ...[
                      const SizedBox(width: 5),
                      const Tooltip(
                        message: 'Switched from the account signed in here',
                        triggerMode: TooltipTriggerMode.tap,
                        child: Icon(
                          Icons.edit_outlined,
                          size: 12,
                          color: T.ember,
                        ),
                      ),
                    ],
                  ],
                ),
                Text(
                  'signing · ${auth.user?.role ?? 'shop floor'}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 10,
                    letterSpacing: 0.6,
                    fontWeight: FontWeight.w700,
                    color: T.inkFaint,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
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
///
/// It spans the screen on a phone, where the screen is one column wide anyway.
/// On a tablet it is held to a column in the bottom corner: a sentence stretched
/// across a landscape screen is read at one end and finished at the other, and
/// these are messages that come and go on their own.
class _ToastDock extends StatelessWidget {
  const _ToastDock();

  @override
  Widget build(BuildContext context) {
    final toasts = context.watch<UiStore>().toasts;
    if (toasts.isEmpty) return const SizedBox.shrink();
    return Align(
      alignment: Alignment.bottomRight,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 460),
        child: _stack(toasts),
      ),
    );
  }

  Widget _stack(List<Toast> toasts) {
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
