<?php
/**
 * Plugin Name: Smart Chat Agent
 * Description: يضيف المساعد الذكي وخدمة العملاء المباشرة إلى موقعك، مع توثيق هوية العملاء المسجلين تلقائياً.
 * Version: 2.0.0
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
        add_filter('plugin_action_links_' . plugin_basename(__FILE__), function ($links) {
            array_unshift($links, '<a href="' . admin_url('options-general.php?page=smart-chat-agent') . '">الإعدادات</a>');
            return $links;
        });
    }

    private function opts() {
        $def = function ($v) { return strpos($v, '__SC_') === 0 ? '' : $v; };
        $o = wp_parse_args(get_option(self::OPT, []), [
            'server' => '', 'site_key' => '', 'secret' => '', 'enabled' => 1, 'identify' => 1, 'exclude' => '',
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
        printf('<script src="%s/widget.js" data-site="%s" async></script>' . "\n", esc_url($o['server']), esc_attr($o['site_key']));
    }

    public function shortcode($atts) {
        $a = shortcode_atts(['text' => 'تواصل معنا', 'class' => 'button'], $atts);
        return sprintf('<a href="#" class="%s" onclick="window.SmartChat&&SmartChat.open();return false;">%s</a>', esc_attr($a['class']), esc_html($a['text']));
    }
}

new Smart_Chat_Agent();
