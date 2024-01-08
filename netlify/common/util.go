package common

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

type CurrentSession struct {
	Session   *Session
	User      *User
	Group     *Group
	UsersById map[int32]User
}

func Authenticate(request events.APIGatewayProxyRequest) (bool, *CurrentSession) {
	cookies := strings.Split(request.Headers["cookie"], ";")
	fmt.Printf("cookies: %v\n", cookies)
	for _, cookie := range cookies {
		if strings.Contains(cookie, "sessionid") {
			parts := strings.Split(cookie, "sessionid=")
			fmt.Printf("parts: %v, %v\n", parts, len(parts))
			return ValidateSession(parts[1])
		}
	}
	return false, nil
}

func ValidateSession(sessionId string) (bool, *CurrentSession) {
	if sessionId == "" {
		return false, nil
	}
	fmt.Printf("sessionId: %s1\n", sessionId)
	session := Session{}
	db, err := gorm.Open(mysql.Open(os.Getenv("DSN")), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		log.Fatalf("failed to connect: %v", err)
		return false, nil
	}
	tx := db.Where("sessionid = ?", sessionId).First(&session)
	if tx.Error != nil {
		return false, nil
	}
	if session.ExpiryTime.Before(time.Now()) {
		return false, nil
	}
	// if username != "" && session.Username != username {
	// 	return false
	// }
	group := Group{}
	user := User{}
	tx = db.Where("username = ?", session.Username).First(&user)
	if tx.Error != nil {
		return false, nil
	}
	tx = db.Where("groupid = ?", user.Groupid).First(&group)
	if tx.Error != nil {
		return false, nil
	}
	userIds := []int32{}
	err = json.Unmarshal([]byte(group.Userids), &userIds)
	if err != nil {
		return false, nil
	}
	users := []User{}
	tx = db.Where("id in ?", userIds).Find(&users)
	if tx.Error != nil {
		return false, nil
	}
	usersById := map[int32]User{}
	for _, user := range users {
		usersById[user.Id] = user
	}
	fmt.Printf("session: %+v\n", session)
	fmt.Printf("user: %+v\n", user)
	fmt.Printf("group: %+v\n", group)
	return true, &CurrentSession{
		Session:   &session,
		User:      &user,
		Group:     &group,
		UsersById: usersById,
	}
}

func GenerateRandomID(length int) (string, error) {
	b := make([]byte, length)
	_, err := rand.Read(b)
	if err != nil {
		return "", err
	}
	id := base64.URLEncoding.EncodeToString(b)
	return id, nil
}
