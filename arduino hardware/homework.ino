

//#include <queue.h>
#include <ESP8266WiFi.h>
#include <Adafruit_PN532.h>
#include "input.h"

#define SDA_PIN 4
#define SCL_PIN 5
#define BUTTON1 0
#define BUTTON2 2
#define BUTTON3 3

class queue{
  unsigned head=0,tail=0;
  static const unsigned short MAX_QUEUE_SIZE = 50;
  unsigned short array[MAX_QUEUE_SIZE+5];
public:
  inline bool isEmpty() const {return head==tail;}
  inline bool isFull() const {return (tail+1)%MAX_QUEUE_SIZE == head;}
  inline unsigned short front() {return array[head];}
  bool push(const unsigned short& data){
    if(isFull())return false;
    array[tail]=data;
    tail=(tail+1)%MAX_QUEUE_SIZE;
    return true;
  }
  bool pop(){
    if(isEmpty())return false;
    head=(head+1)%MAX_QUEUE_SIZE;
    return true;
  }
}task;

enum Taskname{
  button1,
  button2,
  button3,
  readCard,
  screenFlush,
  screenMainPage,
  upload,
  res,
};
unsigned long long delayTime[8];

Adafruit_PN532 pn532(SDA_PIN,SCL_PIN);
int64_t now=0;
const int64_t SECOND = 1000;

void wifiFailed();

void setup() {
  pn532.begin();
  pinMode(BUTTON1,INPUT);
  pinMode(BUTTON2,INPUT);
  pinMode(BUTTON3,INPUT);
  if(digitalRead(BUTTON1)==HIGH){
    getWifi();
    ESP.restart();
  }
  if(!pn532.getFirmwareVersion()){
    lcdset("Nfc init failed");
    while(1);
  }
  lcdset("Connect Wifi");
  WiFi.mode(WIFI_STA);
  WiFi.begin(wifiSsid,wifiPassword);
  delay(2*SECOND);
  now = millis();
  while(WiFi.status() == WL_IDLE_STATUS){
    if(millis()-now >= 10*SECOND){
      lcdset("WiFi TimeOut","Reboot in 5s");
      delay(5000);
      ESP.restart();
    }
  }
  if(WiFi.status()!=WL_CONNECTED)wifiFailed();
  lcdset("Waiting to read","the NFC tag.");
  task.push(readCard);
  delayTime[readCard]=millis()+100;
}

void loop() {
  now=millis();
  switch (task.front()){
    case res:
      ESP.restart();
      break;
    case readCard:
      uint8_t carduid[]={0,0,0,0,0,0,0};
      uint8_t uidlenth=0;
      if(now<delayTime[readCard])break;
      if(pn532.readPassiveTargetID(PN532_MIFARE_ISO14443A,carduid,&uidlenth)){
        //等待下一步编写
      }
  }
}

void wifiFailed(){
  switch (WiFi.status()){
    case WL_NO_SSID_AVAIL:
      lcdset("WiFi not found","NO_SSID_AVAI");
      break;
    case WL_CONNECT_FAILED:
      lcdset("Wrong password","CONNECTED_FAILED");
      break;
    case WL_CONNECTION_LOST:
      lcdset("WiFi disconnect","CONNECTION_LOST");
      break;
    case WL_CONNECTED:
      return;
      break;
    default:
      lcdset("WiFi failed","Unknow error");
      break;
  } 
}