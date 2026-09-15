#!/usr/bin/env bash
set -euo pipefail

green() { printf '\033[32m%s\033[0m\n' "$1"; }
step()  { printf '\n\033[1m%s\033[0m\n' "$1"; }

if [ "$(id -u)" != "0" ]; then
  echo "Запускать нужно от root"
  exit 1
fi

printf '\n\033[1m=== СпокУм · подготовка сервера ===\033[0m\n'

step "1 из 8. Новый пароль root"
echo "Старый пароль засвечен, нужен новый. Набор будет видно на экране."
echo "От восьми символов, латиница и цифры."
while true; do
  printf 'Новый пароль: '
  read -r fresh
  if [ ${#fresh} -lt 8 ]; then
    echo "Коротко, нужно минимум восемь символов"
    continue
  fi
  printf 'Ещё раз для проверки: '
  read -r again
  if [ "$fresh" != "$again" ]; then
    echo "Не совпало, попробуйте снова"
    continue
  fi
  if echo "root:$fresh" | chpasswd; then break; fi
  echo "Система не приняла такой пароль, попробуйте другой"
done
unset fresh again
clear
green "пароль сменён, экран очищен"

step "2 из 8. Обновление системы, это займёт несколько минут"
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
apt-get update -qq
apt-get -o Dpkg::Options::="--force-confold" upgrade -y -qq
apt-get install -y -qq curl ca-certificates gnupg ufw fail2ban unattended-upgrades \
  postgresql-client-16 htop git jq rsync >/dev/null
green "система обновлена"

step "3 из 8. Файл подкачки"
if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  green "добавлено 4 ГБ подкачки"
else
  green "подкачка уже есть"
fi
sysctl -qw vm.swappiness=10
grep -q 'vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf

step "4 из 8. Файрвол"
ufw --force reset >/dev/null 2>&1
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp  comment 'ssh'   >/dev/null
ufw allow 80/tcp  comment 'http'  >/dev/null
ufw allow 443/tcp comment 'https' >/dev/null
ufw --force enable >/dev/null
green "снаружи видны только 22, 80 и 443, база закрыта"

step "5 из 8. Защита от перебора пароля"
cat > /etc/fail2ban/jail.local <<'CONF'
[sshd]
enabled  = true
maxretry = 4
bantime  = 3600
findtime = 600
CONF
systemctl enable --now fail2ban >/dev/null 2>&1
systemctl restart fail2ban >/dev/null 2>&1
green "четыре промаха подряд и адрес блокируется на час"

step "6 из 8. Автообновления безопасности"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF
green "включены"

step "7 из 8. Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com -o /tmp/docker.sh
  sh /tmp/docker.sh >/dev/null 2>&1
  systemctl enable --now docker >/dev/null 2>&1
  green "поставлен"
else
  green "уже стоит"
fi

step "8 из 8. Часовой пояс и имя"
timedatectl set-timezone Europe/Moscow 2>/dev/null || true
hostnamectl set-hostname spokum 2>/dev/null || true
green "Москва, spokum"

IP=$(curl -s4 --max-time 10 ifconfig.me 2>/dev/null || echo "")
[ -z "$IP" ] && IP=$(hostname -I | awk '{print $1}')

printf '\n\033[1m=== Готово ===\033[0m\n\n'
echo "Память:"; free -h | sed -n '1,3p'
echo
echo "Диск:"; df -h / | tail -1
echo
echo "Docker: $(docker --version 2>/dev/null || echo 'нет')"
echo "Адрес:  $IP"
echo
green "Первый шаг закончен. Напишите мне в чат слово готово."
