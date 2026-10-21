<?php
/**
 * Plugin Name: Smart Chat Agent
 * Description: يضيف المساعد الذكي وخدمة العملاء المباشرة إلى موقعك، مع توثيق هوية العملاء المسجلين تلقائياً.
 * Version: 2.2.0
 * Author: Smart Chat
 * Text Domain: smart-chat-agent
 * Requires at least: 5.6
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) exit;

// Filled automatically when the plugin is downloaded from the dashboard ("Install" page).
define('SMART_CHAT_DEFAULT_SERVER', '__SC_SERVER__');
define('SMART_CHAT_DEFAULT_KEY', '__SC_KEY__');
define('SMART_CHAT_DEFAULT_SECRET', '__SC_SECRET__');

class Smart_Chat_Agent {
    const OPT = 'smart_chat_agent';

    public function __construct() {
        add_action('admin_menu', [$this, 'menu']);
        add_action('admin_init', [$this, 'register']);
        add_action('wp_footer', [$this, 'render'], 99);
        add_shortcode('smart_chat_button', [$this, 'shortcode']);
        add_action('rest_api_init', [$this, 'rest']);
        add_action('template_redirect', [$this, 'bridge_page']);
        add_filter('plugin_action_links_' . plugin_basename(__FILE__), function ($links) {
            array_unshift($links, '<a href="' . admin_url('options-general.php?page=smart-chat-agent') . '">الإعدادات</a>');
            return $links;
        });
    }

    private function opts() {
        $def = function ($v) { return strpos($v, '__SC_') === 0 ? '' : $v; };
        $o = wp_parse_args(get_option(self::OPT, []), [
            'server' => '', 'site_key' => '', 'secret' => '', 'enabled' => 1, 'identify' => 1, 'exclude' => '', 'tables' => [],
            'ext_on' => 0, 'ext_host' => '', 'ext_port' => '3306', 'ext_name' => '', 'ext_user' => '', 'ext_pass' => '',
        ]);
        if (!$o['server']) $o['server'] = $def(SMART_CHAT_DEFAULT_SERVER);
        if (!$o['site_key']) $o['site_key'] = $def(SMART_CHAT_DEFAULT_KEY);
        if (!$o['secret']) $o['secret'] = $def(SMART_CHAT_DEFAULT_SECRET);
        return $o;
    }

    public function menu() {
        add_options_page('Smart Chat', 'Smart Chat', 'manage_options', 'smart-chat-agent', [$this, 'page']);
    }

    public function register() {
        register_setting('smart_chat_agent', self::OPT, ['sanitize_callback' => function ($v) {
            return [
                'server'   => esc_url_raw(rtrim(trim($v['server'] ?? ''), '/')),
                'site_key' => sanitize_text_field($v['site_key'] ?? ''),
                'secret'   => sanitize_text_field($v['secret'] ?? ''),
                'enabled'  => empty($v['enabled']) ? 0 : 1,
                'identify' => empty($v['identify']) ? 0 : 1,
                'exclude'  => sanitize_textarea_field($v['exclude'] ?? ''),
                // tables the bot may read (chosen by the site admin; WordPress accounts / settings are never offered)
                'ext_on'   => empty($v['ext_on']) ? 0 : 1,
                'ext_host' => sanitize_text_field($v['ext_host'] ?? ''),
                'ext_port' => (string) max(1, min(65535, (int) ($v['ext_port'] ?? 3306))),
                'ext_name' => sanitize_text_field($v['ext_name'] ?? ''),
                'ext_user' => sanitize_text_field($v['ext_user'] ?? ''),
                // empty = keep the saved password (it is never shown again nor sent to the chat server)
                'ext_pass' => ($v['ext_pass'] ?? '') !== '' ? (string) $v['ext_pass'] : (string) ($this->opts()['ext_pass'] ?? ''),
                'tables'   => array_values(array_map('sanitize_text_field', (array) ($v['tables'] ?? []))),
            ];
        }]);
    }

    public function page() {
        $o = $this->opts(); ?>
        <div class="wrap" dir="rtl">
            <h1>💬 Smart Chat Agent</h1>
            <p><?php echo ($o['server'] && $o['site_key']) ? '✅ الإضافة مربوطة وجاهزة. لا تحتاج تعديل أي شيء هنا.' : 'أدخل بيانات الربط من لوحة تحكم المساعد (صفحة التركيب).'; ?></p>
            <form method="post" action="options.php">
                <?php settings_fields('smart_chat_agent'); ?>
                <table class="form-table">
                    <tr><th>تفعيل المحادثة</th><td><label><input type="checkbox" name="<?php echo self::OPT; ?>[enabled]" value="1" <?php checked($o['enabled']); ?>> إظهار زر المحادثة في الموقع</label></td></tr>
                    <tr><th>رابط الخادم</th><td><input type="url" class="regular-text" dir="ltr" name="<?php echo self::OPT; ?>[server]" value="<?php echo esc_attr($o['server']); ?>" placeholder="https://chat.example.com"></td></tr>
                    <tr><th>مفتاح الموقع</th><td><input type="text" class="regular-text" dir="ltr" name="<?php echo self::OPT; ?>[site_key]" value="<?php echo esc_attr($o['site_key']); ?>"></td></tr>
                    <tr><th>المفتاح السري (IDENTITY_SECRET)</th><td><input type="password" class="regular-text" dir="ltr" name="<?php echo self::OPT; ?>[secret]" value="<?php echo esc_attr($o['secret']); ?>" autocomplete="off">
                        <p class="description">يستخدم لتوثيق هوية العملاء المسجلين حتى يجلب البوت بياناتهم وطلباتهم بأمان.</p></td></tr>
                    <tr><th>توثيق المستخدمين</th><td><label><input type="checkbox" name="<?php echo self::OPT; ?>[identify]" value="1" <?php checked($o['identify']); ?>> إرسال اسم وبريد المستخدم المسجّل دخوله (موقّع)</label></td></tr>
                    <tr><th>صفحات مستثناة</th><td><textarea name="<?php echo self::OPT; ?>[exclude]" rows="3" class="large-text" dir="ltr" placeholder="/checkout&#10;/my-account/*"><?php echo esc_textarea($o['exclude']); ?></textarea>
                        <p class="description">مسار في كل سطر. استخدم * في النهاية لمطابقة البادئة.</p></td></tr>
                    <tr><th>🗄️ قاعدة بيانات خارجية</th><td>
                        <label><input type="checkbox" name="<?php echo self::OPT; ?>[ext_on]" value="1" <?php checked($o['ext_on']); ?>> قراءة أيضاً من قاعدة بيانات منفصلة (MySQL / MariaDB) يصل إليها خادم الموقع — إضافة إلى قاعدة ووردبريس</label>
                        <div style="margin-top:8px;padding:10px;background:#f6f7f7;border-radius:6px">
                            <p><label>الخادم (Host) <input type="text" dir="ltr" name="<?php echo self::OPT; ?>[ext_host]" value="<?php echo esc_attr($o['ext_host']); ?>" placeholder="localhost أو 10.0.0.5 أو db.company.local"></label>
                               <label>المنفذ <input type="number" dir="ltr" style="width:90px" name="<?php echo self::OPT; ?>[ext_port]" value="<?php echo esc_attr($o['ext_port']); ?>"></label></p>
                            <p><label>اسم قاعدة البيانات <input type="text" dir="ltr" name="<?php echo self::OPT; ?>[ext_name]" value="<?php echo esc_attr($o['ext_name']); ?>"></label></p>
                            <p><label>اسم المستخدم <input type="text" dir="ltr" name="<?php echo self::OPT; ?>[ext_user]" value="<?php echo esc_attr($o['ext_user']); ?>" autocomplete="off"></label>
                               <label>كلمة المرور <input type="password" dir="ltr" name="<?php echo self::OPT; ?>[ext_pass]" value="" placeholder="<?php echo $o['ext_pass'] ? '•••••• (محفوظة — اتركها فارغة)' : ''; ?>" autocomplete="new-password"></label></p>
                            <p class="description">يُنصح بمستخدم <b>قراءة فقط</b> (GRANT SELECT). تبقى بيانات الاتصال في موقعك ولا تُرسل إلى خادم المحادثة.</p>
                            <?php if ($o['ext_on']) { $c = $this->ext(); echo is_wp_error($c) ? '<p style="color:#b32d2e">❌ ' . esc_html($c->get_error_message()) . '</p>' : '<p style="color:#007017">✅ متصل بقاعدة البيانات ' . esc_html($o['ext_name']) . '</p>'; } ?>
                        </div></td></tr>
                    <tr><th>🗄️ جداول يقرأ منها البوت</th><td><?php if ($o['ext_on'] && is_wp_error($this->ext())) echo '<p class="description">جداول القاعدة الخارجية تظهر بعد حفظ بيانات اتصال صحيحة.</p>'; ?>
                        <?php $all = $this->all_tables(); if (!$all) echo '<p class="description">لا توجد جداول متاحة.</p>'; $grp = null;
                        foreach ($all as $t) : $g = strpos($t, 'ext:') === 0 ? 'ext' : 'wp'; if ($g !== $grp) { $grp = $g; echo '<p style="margin:10px 0 4px"><b>' . ($g === 'ext' ? '🗄️ القاعدة الخارجية: ' . esc_html($o['ext_name']) : '🧩 قاعدة ووردبريس') . '</b></p>'; } ?><label style="display:block;margin:3px 0"><input type="checkbox" name="<?php echo self::OPT; ?>[tables][]" value="<?php echo esc_attr($t); ?>" <?php checked(in_array($t, (array) $o['tables'], true)); ?>> <code><?php echo esc_html(preg_replace('/^ext:/', '', $t)); ?></code></label><?php endforeach; ?>
                        <p class="description">اختر الجداول التي يحق للبوت قراءة بيانات المستفيدين منها (قراءة فقط، بحث بقيمة محددة مثل رقم الهوية). جداول حسابات ووردبريس وإعداداته لا تظهر هنا ولا يمكن قراءتها.</p></td></tr>
                </table>
                <?php submit_button('حفظ الإعدادات'); ?>
            </form>
            <h2>اختصارات</h2>
            <p>زر لفتح المحادثة في أي صفحة: <code>[smart_chat_button text="تواصل معنا"]</code></p>
            <?php if ($o['server']) : ?><p><a class="button" target="_blank" href="<?php echo esc_url($o['server'] . '/admin/'); ?>">فتح لوحة تحكم المحادثات ↗</a></p><?php endif; ?>
        </div>
    <?php }

    private function excluded($o) {
        $path = wp_parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
        foreach (preg_split('/\r?\n/', (string) $o['exclude']) as $rule) {
            $rule = trim($rule);
            if ($rule === '') continue;
            if (substr($rule, -1) === '*' ? strpos($path, rtrim($rule, '*')) === 0 : rtrim($path, '/') === rtrim($rule, '/')) return true;
        }
        return false;
    }

    public function render() {
        $o = $this->opts();
        if (!$o['enabled'] || !$o['server'] || !$o['site_key'] || is_admin() || $this->excluded($o)) return;
        if ($o['identify'] && $o['secret'] && is_user_logged_in()) {
            $u = wp_get_current_user();
            $email = strtolower($u->user_email);
            $user = [
                'name'  => $u->display_name,
                'email' => $email,
                'sig'   => hash_hmac('sha256', $email, $o['secret']),
            ];
            echo '<script>window.SmartChatUser=' . wp_json_encode($user) . ';</script>' . "\n";
        }
        if (!empty($o['tables'])) echo '<script>window.SmartChatWP=' . wp_json_encode(['rest' => esc_url_raw(rest_url('smartchat/v1/'))]) . ';</script>' . "\n";
        printf('<script src="%s/widget.js" data-site="%s" async></script>' . "\n", esc_url($o['server']), esc_attr($o['site_key']));
    }

    /* ===== data bridge: the bot reads rows from tables the admin allowed — no SQL is accepted from outside ===== */

    // the separate company database (MySQL / MariaDB), connected from this server only
    private $ext_conn = null;
    private function ext() {
        if ($this->ext_conn !== null) return $this->ext_conn;
        $o = $this->opts();
        if (!$o['ext_on'] || !$o['ext_host'] || !$o['ext_name'] || !$o['ext_user'] || !class_exists('mysqli')) return $this->ext_conn = new WP_Error('sc_db', 'أكمل بيانات الاتصال');
        mysqli_report(MYSQLI_REPORT_OFF);
        $m = mysqli_init();
        $m->options(MYSQLI_OPT_CONNECT_TIMEOUT, 6);
        if (!@$m->real_connect($o['ext_host'], $o['ext_user'], $o['ext_pass'], $o['ext_name'], (int) $o['ext_port'])) return $this->ext_conn = new WP_Error('sc_db', 'تعذر الاتصال: ' . mysqli_connect_error());
        $m->set_charset('utf8mb4');
        return $this->ext_conn = $m;
    }
    // a table id is "name" (WordPress database) or "ext:name" (the separate database)
    private function split($id) { return strpos((string) $id, 'ext:') === 0 ? ['ext', substr($id, 4)] : ['wp', (string) $id]; }

    // runs a query whose values are given separately ('?' placeholders) on one of the two databases
    private function q($src, $sql, $vals = []) {
        global $wpdb;
        if ($src !== 'ext') { $sql = str_replace('?', '%s', $sql); return (array) $wpdb->get_results($vals ? $wpdb->prepare($sql, $vals) : $sql, ARRAY_A); }
        $m = $this->ext(); if (is_wp_error($m)) return $m;
        $i = 0; $sql = preg_replace_callback('/\?/', function () use (&$i, $vals, $m) { return "'" . $m->real_escape_string((string) ($vals[$i++] ?? '')) . "'"; }, $sql);
        $res = $m->query($sql); if (!$res) return new WP_Error('sc_db', $m->error);
        $rows = []; while ($row = $res->fetch_assoc()) $rows[] = $row; $res->free();
        return $rows;
    }

    private function all_tables() {
        global $wpdb;
        $core = ['users', 'usermeta', 'options', 'posts', 'postmeta', 'comments', 'commentmeta', 'terms', 'termmeta', 'term_taxonomy', 'term_relationships', 'links'];
        $out = [];
        $rows = $this->q('wp', 'SELECT TABLE_NAME t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME', [DB_NAME]);
        foreach (is_wp_error($rows) ? [] : $rows as $r) {
            if (strpos($r['t'], $wpdb->prefix) === 0 && in_array(substr($r['t'], strlen($wpdb->prefix)), $core, true)) continue; // WordPress accounts / settings are never offered
            $out[] = $r['t'];
        }
        if ($this->opts()['ext_on']) {
            $rows = $this->q('ext', 'SELECT TABLE_NAME t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME', [$this->opts()['ext_name']]);
            foreach (is_wp_error($rows) ? [] : $rows as $r) $out[] = 'ext:' . $r['t'];
        }
        return $out;
    }
    private function columns($id) {
        list($src, $name) = $this->split($id);
        $rows = $this->q($src, 'SELECT COLUMN_NAME c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION', [$src === 'ext' ? $this->opts()['ext_name'] : DB_NAME, $name]);
        return is_wp_error($rows) ? [] : array_column($rows, 'c');
    }

    // every request is signed by the chat server (HMAC-SHA256 with the site secret), expires quickly and works once
    private function verify($data, $sig) {
        $o = $this->opts();
        if (!$o['secret'] || !is_string($data) || !is_string($sig) || !hash_equals(hash_hmac('sha256', $data, $o['secret']), $sig)) return new WP_Error('sc_auth', 'bad signature', ['status' => 403]);
        $r = json_decode($data, true);
        if (!is_array($r) || empty($r['nonce']) || empty($r['exp']) || $r['exp'] < time() || $r['exp'] > time() + 600) return new WP_Error('sc_auth', 'expired', ['status' => 403]);
        $k = 'sc_n_' . md5((string) $r['nonce']);
        if (get_transient($k)) return new WP_Error('sc_auth', 'used', ['status' => 403]);
        set_transient($k, 1, 900);
        return $r;
    }

    // {table, columns[], where{col: value}, any(bool: OR instead of AND)} → rows (max 5)
    private function read_rows($r) {
        $o = $this->opts();
        $table = (string) ($r['table'] ?? '');
        if (!in_array($table, (array) $o['tables'], true) || !in_array($table, $this->all_tables(), true)) return new WP_Error('sc_table', 'table not allowed', ['status' => 403]);
        $cols = $this->columns($table);
        $show = array_values(array_intersect((array) ($r['columns'] ?? []), $cols));
        $where = is_array($r['where'] ?? null) ? $r['where'] : [];
        $conds = []; $vals = [];
        foreach ($where as $c => $v) {
            if (!in_array($c, $cols, true) || $v === '' || $v === null) continue;
            $conds[] = 'CAST(`' . str_replace('`', '', $c) . '` AS CHAR) = ?'; $vals[] = (string) $v;
        }
        if (!$conds) return new WP_Error('sc_where', 'a search value is required', ['status' => 400]);
        $sel = $show ? implode(', ', array_map(function ($c) { return '`' . str_replace('`', '', $c) . '`'; }, $show)) : '*';
        list($src, $name) = $this->split($table);
        return $this->q($src, 'SELECT ' . $sel . ' FROM `' . str_replace('`', '', $name) . '` WHERE ' . implode(empty($r['any']) ? ' AND ' : ' OR ', $conds) . ' LIMIT 5', $vals);
    }

    public function rest() {
        register_rest_route('smartchat/v1', '/read', [
            'methods' => 'POST', 'permission_callback' => '__return_true',
            'callback' => function ($req) {
                $r = $this->verify($req->get_param('data'), $req->get_param('sig'));
                if (is_wp_error($r)) return $r;
                if (($r['op'] ?? '') !== 'read') return new WP_Error('sc_op', 'bad request', ['status' => 400]);
                $rows = $this->read_rows($r);
                return is_wp_error($rows) ? $rows : ['rows' => $rows];
            },
        ]);
    }

    // opened by the chat dashboard in a small window: lists the allowed tables (or tests a read) and posts the result back
    public function bridge_page() {
        if (empty($_GET['smartchat_bridge'])) return;
        $o = $this->opts();
        $r = $this->verify(wp_unslash($_GET['smartchat_bridge']), wp_unslash($_GET['sig'] ?? ''));
        if (is_wp_error($r)) $res = ['ok' => false, 'error' => $r->get_error_message()];
        elseif (($r['op'] ?? '') === 'schema') $res = ['ok' => true, 'tables' => array_map(function ($t) { return ['name' => $t, 'columns' => $this->columns($t)]; }, (array) $o['tables'])];
        elseif (($r['op'] ?? '') === 'read') { $x = $this->read_rows($r); $res = is_wp_error($x) ? ['ok' => false, 'error' => $x->get_error_message()] : ['ok' => true, 'rows' => $x]; }
        else $res = ['ok' => false, 'error' => 'bad request'];
        $res['type'] = 'smartchat-bridge';
        $origin = preg_replace('#^(https?://[^/]+).*$#', '$1', (string) $o['server']);
        nocache_headers();
        header('Content-Type: text/html; charset=utf-8');
        echo '<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;text-align:center;padding:40px">⏳<script>try{window.opener&&window.opener.postMessage(' . wp_json_encode($res) . ',' . wp_json_encode($origin) . ')}catch(e){}setTimeout(function(){window.close()},500)</script></body>';
        exit;
    }

    public function shortcode($atts) {
        $a = shortcode_atts(['text' => 'تواصل معنا', 'class' => 'button'], $atts);
        return sprintf('<a href="#" class="%s" onclick="window.SmartChat&&SmartChat.open();return false;">%s</a>', esc_attr($a['class']), esc_html($a['text']));
    }
}

new Smart_Chat_Agent();
