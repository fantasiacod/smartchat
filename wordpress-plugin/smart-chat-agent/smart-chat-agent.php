<?php
/**
 * Plugin Name: Smart Chat Agent
 * Description: يضيف المساعد الذكي وخدمة العملاء المباشرة إلى موقعك، مع توثيق هوية العملاء المسجلين تلقائياً.
 * Version: 2.1.0
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
                'tables'   => array_values(array_intersect(array_map('sanitize_text_field', (array) ($v['tables'] ?? [])), $this->all_tables())),
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
                    <tr><th>🗄️ جداول يقرأ منها البوت</th><td>
                        <?php $all = $this->all_tables(); if (!$all) echo '<p class="description">لا توجد جداول إضافية في قاعدة بيانات الموقع.</p>';
                        foreach ($all as $t) : ?><label style="display:block;margin:3px 0"><input type="checkbox" name="<?php echo self::OPT; ?>[tables][]" value="<?php echo esc_attr($t); ?>" <?php checked(in_array($t, (array) $o['tables'], true)); ?>> <code><?php echo esc_html($t); ?></code></label><?php endforeach; ?>
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

    private function all_tables() {
        global $wpdb;
        $core = ['users', 'usermeta', 'options', 'posts', 'postmeta', 'comments', 'commentmeta', 'terms', 'termmeta', 'term_taxonomy', 'term_relationships', 'links'];
        $out = [];
        foreach ((array) $wpdb->get_col($wpdb->prepare('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = %s ORDER BY TABLE_NAME', DB_NAME)) as $t) {
            if (strpos($t, $wpdb->prefix) === 0 && in_array(substr($t, strlen($wpdb->prefix)), $core, true)) continue;
            $out[] = $t;
        }
        return $out;
    }
    private function columns($table) {
        global $wpdb;
        return (array) $wpdb->get_col($wpdb->prepare('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s ORDER BY ORDINAL_POSITION', DB_NAME, $table));
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
        global $wpdb;
        $o = $this->opts();
        $table = (string) ($r['table'] ?? '');
        if (!in_array($table, (array) $o['tables'], true)) return new WP_Error('sc_table', 'table not allowed', ['status' => 403]);
        $cols = $this->columns($table);
        $show = array_values(array_intersect((array) ($r['columns'] ?? []), $cols));
        $where = is_array($r['where'] ?? null) ? $r['where'] : [];
        $conds = []; $vals = [];
        foreach ($where as $c => $v) {
            if (!in_array($c, $cols, true) || $v === '' || $v === null) continue;
            $conds[] = 'CAST(`' . str_replace('`', '', $c) . '` AS CHAR) = %s'; $vals[] = (string) $v;
        }
        if (!$conds) return new WP_Error('sc_where', 'a search value is required', ['status' => 400]);
        $sel = $show ? implode(', ', array_map(function ($c) { return '`' . str_replace('`', '', $c) . '`'; }, $show)) : '*';
        $sql = 'SELECT ' . $sel . ' FROM `' . str_replace('`', '', $table) . '` WHERE ' . implode(empty($r['any']) ? ' AND ' : ' OR ', $conds) . ' LIMIT 5';
        return (array) $wpdb->get_results($wpdb->prepare($sql, $vals), ARRAY_A);
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
