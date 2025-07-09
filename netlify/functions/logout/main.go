package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/kofj/gorm-driver-d1"
	"gorm.io/gorm"
)

type User struct {
	Id       int32
	Username string
	Password string
	Groupid  int32
}

type Session struct {
	Username   string
	Sessionid  string
	ExpiryTime time.Time
}

func (User) TableName() string {
	return "users"
}

func (Session) TableName() string {
	return "sessions"
}

func handler(request events.APIGatewayProxyRequest) (*events.APIGatewayProxyResponse, error) {
	if request.HTTPMethod != "POST" {
		return &events.APIGatewayProxyResponse{
			StatusCode: 400,
		}, nil
	}

	expiration := time.Now().Add(-24 * time.Hour)
	cookies := strings.Split(request.Headers["cookie"], ";")
	fmt.Printf("cookies: %v\n", cookies)
	for _, cookie := range cookies {
		if strings.Contains(cookie, "sessionid") {
			parts := strings.Split(cookie, "sessionid=")
			fmt.Printf("parts: %v, %v\n", parts, len(parts))
			logout(parts[1])
		}
	}

	sessionCookie := http.Cookie{
		Name:     "sessionid",
		Value:    "",
		Expires:  expiration,
		HttpOnly: true,
		Path:     "/",
	}

	return &events.APIGatewayProxyResponse{
		StatusCode: 200,
		Body:       "{}",
		Headers: map[string]string{
			"Set-Cookie": sessionCookie.String(),
		},
	}, nil
}

func main() {
	lambda.Start(handler)
}

func logout(sessionid string) {
	if sessionid == "" {
		return
	}
	session := Session{}
	dsn := os.Getenv("DSN_D1")
	if dsn == "" {
		log.Println("DSN_D1 environment variable not set")
		return
	}
	db, err := gorm.Open(d1.Open(dsn), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		log.Printf("failed to connect to D1: %v", err)
		return
	}
	tx := db.Where("sessionid = ?", sessionid).First(&session)
	if tx.Error != nil {
		return
	}
	db.Delete(&Session{}, "sessionid = ?", sessionid)
}
